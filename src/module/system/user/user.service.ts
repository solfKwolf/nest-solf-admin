import { Repository, In, Not } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from 'src/module/redis/redis.service';
import * as bcrypt from 'bcrypt';

import { GetNowDate, GenerateUUID, Uniq } from 'src/common/utils/index';
import {
  CacheEnum,
  DelFlagEnum,
  StatusEnum,
  DataScopeEnum,
} from 'src/common/enum/index';
import {
  LOGIN_TOKEN_EXPIRESIN,
  SYS_USER_TYPE,
} from 'src/common/constant/index';
import { ResultData } from 'src/common/utils/result';
import {
  CreateUserDto,
  UpdateUserDto,
  ListUserDto,
  ChangeStatusDto,
  ResetPwdDto,
  AllocatedListDto,
} from './dto/index';
import { RegisterDto, LoginDto, ClientInfoDto } from '../../main/dto/index';
import {
  AuthUserCancelDto,
  AuthUserCancelAllDto,
  AuthUserSelectAllDto,
} from '../role/dto/index';

import { UserEntity } from './entities/sys-user.entity';
import { SysUserWithPostEntity } from './entities/user-width-post.entity';
import { SysUserWithRoleEntity } from './entities/user-width-role.entity';
import { SysPostEntity } from '../post/entities/post.entity';
import { SysDeptEntity } from '../dept/entities/dept.entity';
import { RoleService } from '../role/role.service';
import { DeptService } from '../dept/dept.service';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(SysDeptEntity)
    private readonly sysDeptEntityRep: Repository<SysDeptEntity>,
    @InjectRepository(SysPostEntity)
    private readonly sysPostEntityRep: Repository<SysPostEntity>,
    @InjectRepository(SysUserWithPostEntity)
    private readonly sysUserWithPostEntityRep: Repository<SysUserWithPostEntity>,
    @InjectRepository(SysUserWithRoleEntity)
    private readonly sysUserWithRoleEntityRep: Repository<SysUserWithRoleEntity>,
    private readonly roleService: RoleService,
    private readonly deptService: DeptService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}
  /**
   * 后台创建用户
   * @param createUserDto
   * @returns
   */
  async create(createUserDto: CreateUserDto) {
    const loginDate = GetNowDate();

    if (createUserDto.password) {
      createUserDto.password = await bcrypt.hashSync(
        createUserDto.password,
        bcrypt.genSaltSync(10),
      );
    }

    const res = await this.userRepo.save({
      ...createUserDto,
      loginDate,
      userType: SYS_USER_TYPE.CUSTOM,
    });
    const postEntity =
      this.sysUserWithPostEntityRep.createQueryBuilder('postEntity');
    const postValues = createUserDto.postIds.map((id) => {
      return {
        userId: res.userId,
        postId: id,
      };
    });
    postEntity.insert().values(postValues).execute();

    const roleEntity =
      this.sysUserWithRoleEntityRep.createQueryBuilder('roleEntity');
    const roleValues = createUserDto.roleIds.map((id) => {
      return {
        userId: res.userId,
        roleId: id,
      };
    });
    roleEntity.insert().values(roleValues).execute();

    return ResultData.ok();
  }

  /**
   * 用户列表
   * @param query
   * @returns
   */
  async findAll(query: ListUserDto, user: any) {
    const entity = this.userRepo.createQueryBuilder('user');
    entity.where('user.delFlag = :delFlag', { delFlag: '0' });

    //数据权限过滤
    if (user) {
      const roles = user.roles;
      const deptIds = [];
      let dataScopeAll = false;
      let dataScopeSelf = false;
      for (let index = 0; index < roles.length; index++) {
        const role = roles[index];
        if (role.dataScope === DataScopeEnum.DATA_SCOPE_ALL) {
          dataScopeAll = true;
          break;
        } else if (role.dataScope === DataScopeEnum.DATA_SCOPE_CUSTOM) {
          const roleWithDeptIds = await this.roleService.findRoleWithDeptIds(
            role.roleId,
          );
          deptIds.push(...roleWithDeptIds);
        } else if (
          role.dataScope === DataScopeEnum.DATA_SCOPE_DEPT ||
          role.dataScope === DataScopeEnum.DATA_SCOPE_DEPT_AND_CHILD
        ) {
          const dataScopeWidthDeptIds =
            await this.deptService.findDeptIdsByDataScope(
              user.deptId,
              role.dataScope,
            );
          deptIds.push(...dataScopeWidthDeptIds);
        } else if (role.dataScope === DataScopeEnum.DATA_SCOPE_SELF) {
          dataScopeSelf = true;
        }
      }

      if (!dataScopeAll) {
        if (deptIds.length > 0) {
          entity.where('user.deptId IN (:...deptIds)', { deptIds: deptIds });
        } else if (dataScopeSelf) {
          entity.where('user.userId = :userId', { userId: user.userId });
        }
      }
    }

    if (query.deptId) {
      const deptIds = await this.deptService.findDeptIdsByDataScope(
        +query.deptId,
        DataScopeEnum.DATA_SCOPE_DEPT_AND_CHILD,
      );
      entity.andWhere('user.deptId IN (:...deptIds)', { deptIds: deptIds });
    }

    if (query.userName) {
      entity.andWhere(`user.userName LIKE "%${query.userName}%"`);
    }

    if (query.phonenumber) {
      entity.andWhere(`user.phonenumber LIKE "%${query.phonenumber}%"`);
    }

    if (query.status) {
      entity.andWhere('user.status = :status', { status: query.status });
    }

    if (query.params?.beginTime && query.params?.endTime) {
      entity.andWhere('user.createTime BETWEEN :start AND :end', {
        start: query.params.beginTime,
        end: query.params.endTime,
      });
    }

    entity.skip(query.pageSize * (query.pageNum - 1)).take(query.pageSize);
    //联查部门详情
    entity.leftJoinAndMapOne(
      'user.dept',
      SysDeptEntity,
      'dept',
      'dept.deptId = user.deptId',
    );

    const [list, total] = await entity.getManyAndCount();

    return ResultData.ok({
      list,
      total,
    });
  }

  /**
   * 用户角色+岗位信息
   * @returns
   */
  async findPostAndRoleAll() {
    const posts = await this.sysPostEntityRep.find({
      where: {
        delFlag: '0',
      },
    });
    const roles = await this.roleService.findRoles({
      where: {
        delFlag: '0',
      },
    });

    return ResultData.ok({
      posts,
      roles,
    });
  }

  async findOne(userId: number) {
    const data = await this.userRepo.findOne({
      where: {
        delFlag: '0',
        userId: userId,
      },
    });

    const dept = await this.sysDeptEntityRep.findOne({
      where: {
        delFlag: '0',
        deptId: data.deptId,
      },
    });
    data['dept'] = dept;

    const postList = await this.sysUserWithPostEntityRep.find({
      where: {
        userId: userId,
      },
    });
    const postIds = postList.map((item) => item.postId);
    const allPosts = await this.sysPostEntityRep.find({
      where: {
        delFlag: '0',
      },
    });

    const roleIds = await this.getRoleIds([userId]);
    const allRoles = await this.roleService.findRoles({
      where: {
        delFlag: '0',
      },
    });

    data['roles'] = allRoles.filter((item) => roleIds.includes(item.roleId));

    return ResultData.ok({
      data,
      postIds,
      posts: allPosts,
      roles: allRoles,
      roleIds,
    });
  }

  /**
   * 更新用户
   * @param updateUserDto
   * @returns
   */
  async update(updateUserDto: UpdateUserDto) {
    if (updateUserDto?.postIds?.length > 0) {
      //用户已有岗位,先删除所有关联岗位
      const hasPostId = await this.sysUserWithPostEntityRep.findOne({
        where: {
          userId: updateUserDto.userId,
        },
        select: ['postId'],
      });

      if (hasPostId) {
        await this.sysUserWithPostEntityRep.delete({
          userId: updateUserDto.userId,
        });
      }
      const postEntity =
        this.sysUserWithPostEntityRep.createQueryBuilder('postEntity');
      const postValues = updateUserDto.postIds.map((id) => {
        return {
          userId: updateUserDto.userId,
          postId: id,
        };
      });
      postEntity.insert().values(postValues).execute();
    }

    if (updateUserDto?.roleIds?.length > 0) {
      //用户已有角色,先删除所有关联角色
      const hasRoletId = await this.sysUserWithRoleEntityRep.findOne({
        where: {
          userId: updateUserDto.userId,
        },
        select: ['roleId'],
      });
      if (hasRoletId) {
        await this.sysUserWithRoleEntityRep.delete({
          userId: updateUserDto.userId,
        });
      }
      const roleEntity =
        this.sysUserWithRoleEntityRep.createQueryBuilder('roleEntity');
      const roleValues = updateUserDto.roleIds.map((id) => {
        return {
          userId: updateUserDto.userId,
          roleId: id,
        };
      });
      roleEntity.insert().values(roleValues).execute();
    }

    delete updateUserDto.password;
    delete (updateUserDto as any).dept;
    delete (updateUserDto as any).roles;
    delete (updateUserDto as any).roleIds;
    delete (updateUserDto as any).postIds;

    //更新用户信息
    const data = await this.userRepo.update(
      { userId: updateUserDto.userId },
      updateUserDto,
    );
    return ResultData.ok(data);
  }

  /**
   * 登陆
   */
  async login(user: LoginDto, clientInfo: ClientInfoDto) {
    const data = await this.userRepo.findOne({
      where: {
        userName: user.username,
      },
      select: ['userId', 'password'],
    });

    if (!(data && bcrypt.compareSync(user.password, data.password))) {
      return ResultData.fail(500, `帐号或密码错误`);
    }

    const userData = await this.getUserinfo(data.userId);

    if (userData.delFlag === DelFlagEnum.DELETE) {
      return ResultData.fail(500, `您已被禁用，如需正常使用请联系管理员`);
    }
    if (userData.status === StatusEnum.STOP) {
      return ResultData.fail(500, `您已被停用，如需正常使用请联系管理员`);
    }

    const loginDate = new Date();
    await this.userRepo.update(
      {
        userId: data.userId,
      },
      {
        loginDate: loginDate,
      },
    );

    const uuid = GenerateUUID();
    const token = this.createToken({ uuid: uuid, userId: userData.userId });
    const permissions = await this.getUserPermissions(userData.userId);
    const deptData = await this.sysDeptEntityRep.findOne({
      where: {
        deptId: userData.deptId,
      },
      select: ['deptName'],
    });

    userData['deptName'] = deptData.deptName || '';
    const roles = userData.roles.map((item) => item.roleKey);
    const metaData = {
      browser: clientInfo.browser,
      ipaddr: clientInfo.ipaddr,
      loginLocation: clientInfo.loginLocation,
      loginTime: loginDate,
      os: clientInfo.os,
      permissions: permissions,
      roles: roles,
      token: uuid,
      user: userData,
      userId: userData.userId,
      username: userData.userName,
      deptId: userData.deptId,
    };
    await this.redisService.set(
      `${CacheEnum.LOGIN_TOKEN_KEY}${uuid}`,
      metaData,
      LOGIN_TOKEN_EXPIRESIN,
    );
    return ResultData.ok(
      {
        token,
      },
      '登录成功',
    );
  }

  /**
   * 获取角色Id列表
   * @param userId
   * @returns
   */
  async getRoleIds(userIds: Array<number>) {
    const roleList = await this.sysUserWithRoleEntityRep.find({
      where: {
        userId: In(userIds),
      },
      select: ['roleId'],
    });
    const roleIds = roleList.map((item) => item.roleId);
    return Uniq(roleIds);
  }

  /**
   * 获取权限列表
   * @param userId
   * @returns
   */
  async getUserPermissions(userId: number) {
    // 超级管理员
    if (userId === 1) {
      return ['*:*:*'];
    }
    const roleIds = await this.getRoleIds([userId]);
    const list = await this.roleService.getPermissionsByRoleIds(roleIds);
    const permissions = Uniq(list.map((item) => item.perms)).filter((item) =>
      item.trim(),
    );
    return permissions;
  }

  /**
   * 获取用户信息
   */
  async getUserinfo(userId: number): Promise<
    {
      dept: SysDeptEntity;
      roles: Array<any>;
      posts: Array<SysPostEntity>;
    } & UserEntity
  > {
    const entity = this.userRepo.createQueryBuilder('user');
    entity.where({
      userId: userId,
      delFlag: DelFlagEnum.NORMAL,
    });
    //联查部门详情
    entity.leftJoinAndMapOne(
      'user.dept',
      SysDeptEntity,
      'dept',
      'dept.deptId = user.deptId',
    );
    const roleIds = await this.getRoleIds([userId]);

    const roles = await this.roleService.findRoles({
      where: {
        delFlag: '0',
        roleId: In(roleIds),
      },
    });

    const postIds = (
      await this.sysUserWithPostEntityRep.find({
        where: {
          userId: userId,
        },
        select: ['postId'],
      })
    ).map((item) => item.postId);

    const posts = await this.sysPostEntityRep.find({
      where: {
        delFlag: '0',
        postId: In(postIds),
      },
    });

    const data: any = await entity.getOne();
    data['roles'] = roles;
    data['posts'] = posts;
    return data;
  }

  /**
   * 注册
   */
  async register(user: RegisterDto) {
    const loginDate = GetNowDate();
    const checkUserNameUnique = await this.userRepo.findOne({
      where: {
        userName: user.username,
      },
      select: ['userName'],
    });
    if (checkUserNameUnique) {
      return ResultData.fail(
        500,
        `保存用户'${user.username}'失败，注册账号已存在`,
      );
    }
    user['userName'] = user.username;
    user['nickName'] = user.username;
    await this.userRepo.save({ ...user, loginDate });
    return ResultData.ok();
  }

  /**
   * 从数据声明生成令牌
   *
   * @param payload 数据声明
   * @return 令牌
   */
  createToken(payload: { uuid: string; userId: number }): string {
    const accessToken = this.jwtService.sign(payload);
    return accessToken;
  }

  /**
   * 从令牌中获取数据声明
   *
   * @param token 令牌
   * @return 数据声明
   */
  parseToken(token: string) {
    try {
      if (!token) return null;
      const payload = this.jwtService.verify(token.replace('Bearer ', ''));
      return payload;
    } catch (error) {
      return null;
    }
  }

  /**
   * 重置密码
   * @param body
   * @returns
   */
  async resetPwd(body: ResetPwdDto) {
    if (body.userId === 1) {
      return ResultData.fail(500, '系统用户不能重置密码');
    }
    if (body.password) {
      body.password = await bcrypt.hashSync(
        body.password,
        bcrypt.genSaltSync(10),
      );
    }
    await this.userRepo.update(
      {
        userId: body.userId,
      },
      {
        password: body.password,
      },
    );
    return ResultData.ok();
  }

  /**
   * 批量删除用户
   * @param ids
   * @returns
   */
  async remove(ids: number[]) {
    // 忽略系统角色的删除
    const data = await this.userRepo.update(
      { userId: In(ids), userType: Not(SYS_USER_TYPE.SYS) },
      {
        delFlag: '1',
      },
    );
    return ResultData.ok(data);
  }

  /**
   * 角色详情
   * @param id
   * @returns
   */
  async authRole(userId: number) {
    const allRoles = await this.roleService.findRoles({
      where: {
        delFlag: '0',
      },
    });

    const user = await this.userRepo.findOne({
      where: {
        delFlag: '0',
        userId: userId,
      },
    });

    const dept = await this.sysDeptEntityRep.findOne({
      where: {
        delFlag: '0',
        deptId: user.deptId,
      },
    });
    user['dept'] = dept;

    const roleIds = await this.getRoleIds([userId]);
    //TODO flag用来给前端表格标记选中状态，后续优化
    user['roles'] = allRoles.filter((item) => {
      if (roleIds.includes(item.roleId)) {
        item['flag'] = true;
        return true;
      } else {
        return true;
      }
    });

    return ResultData.ok({
      roles: allRoles,
      user,
    });
  }

  /**
   * 更新用户角色信息
   * @param query
   * @returns
   */
  async updateAuthRole(query) {
    const roleIds = query.roleIds.split(',');
    if (roleIds?.length > 0) {
      //用户已有角色,先删除所有关联角色
      const hasRoletId = await this.sysUserWithRoleEntityRep.findOne({
        where: {
          userId: query.userId,
        },
        select: ['roleId'],
      });
      if (hasRoletId) {
        await this.sysUserWithRoleEntityRep.delete({
          userId: query.userId,
        });
      }
      const roleEntity =
        this.sysUserWithRoleEntityRep.createQueryBuilder('roleEntity');
      const roleValues = roleIds.map((id) => {
        return {
          userId: query.userId,
          roleId: id,
        };
      });
      roleEntity.insert().values(roleValues).execute();
    }
    return ResultData.ok();
  }

  /**
   * 修改用户状态
   * @param changeStatusDto
   * @returns
   */
  async changeStatus(changeStatusDto: ChangeStatusDto) {
    const userData = await this.userRepo.findOne({
      where: {
        userId: changeStatusDto.userId,
      },
      select: ['userType'],
    });
    if (userData.userType === SYS_USER_TYPE.SYS) {
      return ResultData.fail(500, '系统角色不可停用');
    }

    const res = await this.userRepo.update(
      { userId: changeStatusDto.userId },
      {
        status: changeStatusDto.status,
      },
    );
    return ResultData.ok(res);
  }

  /**
   * 部门树
   * @returns
   */
  async deptTree() {
    const tree = await this.deptService.deptTree();
    return ResultData.ok(tree);
  }

  /**
   * 获取角色已分配用户
   * @param query
   * @returns
   */
  async allocatedList(query: AllocatedListDto) {
    const roleWidthRoleList = await this.sysUserWithRoleEntityRep.find({
      where: {
        roleId: +query.roleId,
      },
      select: ['userId'],
    });
    if (roleWidthRoleList.length === 0) {
      return ResultData.ok({
        list: [],
        total: 0,
      });
    }
    const userIds = roleWidthRoleList.map((item) => item.userId);
    const entity = this.userRepo.createQueryBuilder('user');
    entity.where('user.delFlag = :delFlag', { delFlag: '0' });
    entity.andWhere('user.status = :status', { status: '0' });
    entity.andWhere('user.userId IN (:...userIds)', { userIds: userIds });
    if (query.userName) {
      entity.andWhere(`user.userName LIKE "%${query.userName}%"`);
    }

    if (query.phonenumber) {
      entity.andWhere(`user.phonenumber LIKE "%${query.phonenumber}%"`);
    }
    entity.skip(query.pageSize * (query.pageNum - 1)).take(query.pageSize);
    //联查部门详情
    entity.leftJoinAndMapOne(
      'user.dept',
      SysDeptEntity,
      'dept',
      'dept.deptId = user.deptId',
    );
    const [list, total] = await entity.getManyAndCount();
    return ResultData.ok({
      list,
      total,
    });
  }

  /**
   * 获取角色未分配用户
   * @param query
   * @returns
   */
  async unallocatedList(query: AllocatedListDto) {
    const roleWidthRoleList = await this.sysUserWithRoleEntityRep.find({
      where: {
        roleId: +query.roleId,
      },
      select: ['userId'],
    });

    const userIds = roleWidthRoleList.map((item) => item.userId);
    const entity = this.userRepo.createQueryBuilder('user');
    entity.where('user.delFlag = :delFlag', { delFlag: '0' });
    entity.andWhere('user.status = :status', { status: '0' });
    entity.andWhere({
      userId: Not(In(userIds)),
    });
    if (query.userName) {
      entity.andWhere(`user.userName LIKE "%${query.userName}%"`);
    }

    if (query.phonenumber) {
      entity.andWhere(`user.phonenumber LIKE "%${query.phonenumber}%"`);
    }
    entity.skip(query.pageSize * (query.pageNum - 1)).take(query.pageSize);
    //联查部门详情
    entity.leftJoinAndMapOne(
      'user.dept',
      SysDeptEntity,
      'dept',
      'dept.deptId = user.deptId',
    );
    const [list, total] = await entity.getManyAndCount();
    return ResultData.ok({
      list,
      total,
    });
  }

  /**
   * 用户解绑角色
   * @param data
   * @returns
   */
  async authUserCancel(data: AuthUserCancelDto) {
    await this.sysUserWithRoleEntityRep.delete({
      userId: data.userId,
      roleId: data.roleId,
    });
    return ResultData.ok();
  }

  /**
   * 用户批量解绑角色
   * @param data
   * @returns
   */
  async authUserCancelAll(data: AuthUserCancelAllDto) {
    const userIds = data.userIds.split(',').map((id) => +id);
    await this.sysUserWithRoleEntityRep.delete({
      userId: In(userIds),
      roleId: +data.roleId,
    });
    return ResultData.ok();
  }

  /**
   * 用户批量绑定角色
   * @param data
   * @returns
   */
  async authUserSelectAll(data: AuthUserSelectAllDto) {
    const userIds = data.userIds.split(',');
    const entitys = userIds.map((userId) => {
      const sysDeptEntityEntity = new SysUserWithRoleEntity();
      return Object.assign(sysDeptEntityEntity, {
        userId: userId,
        roleId: +data.roleId,
      });
    });
    await this.sysUserWithRoleEntityRep.save(entitys);
    return ResultData.ok();
  }
}
