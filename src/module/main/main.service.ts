import { Injectable } from '@nestjs/common';
import { ClientInfoDto, LoginDto } from './dto';
import { AxiosService } from '../axios/axios.service';
import { UserService } from '../system/user/user.service';
import { SUCCESS_CODE } from 'src/common/utils/result';
import { LoginlogService } from '../monitor/loginlog/loginlog.service';

@Injectable()
export class MainService {
  constructor(
    private readonly userService: UserService,
    private readonly axiosService: AxiosService,
    private readonly loginlogService: LoginlogService,
  ) {}

  /**
   * 登陆
   * @param user
   * @returns
   */
  async login(user: LoginDto, clientInfo: ClientInfoDto) {
    const loginLog = {
      ...clientInfo,
      userName: user.username,
      status: '0',
      msg: '',
    };
    try {
      const loginLocation = await this.axiosService.getIpAddress(
        clientInfo.ipaddr,
      );
      loginLog.loginLocation = loginLocation;
    } catch (error) {}
    const loginRes = await this.userService.login(user, loginLog);
    loginLog.status = loginRes.code === SUCCESS_CODE ? '0' : '1';
    loginLog.msg = loginRes.msg;
    this.loginlogService.create(loginLog);
    return loginRes;
  }
}
