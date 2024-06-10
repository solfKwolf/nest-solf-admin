import { Injectable } from '@nestjs/common';
import { ClientInfoDto, LoginDto } from './dto';

@Injectable()
export class MainService {
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
    console.log(loginLog);
    return {};
  }
}
