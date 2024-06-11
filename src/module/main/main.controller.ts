import { Body, Controller, HttpCode, Post, Request } from '@nestjs/common';
import { MainService } from './main.service';
import { ApiBody, ApiOperation } from '@nestjs/swagger';
import * as Useragent from 'useragent';
import { LoginDto } from './dto';

@Controller('/')
export class MainController {
  constructor(private readonly mainService: MainService) {}

  @ApiOperation({
    summary: '用户登陆',
  })
  @ApiBody({
    type: LoginDto,
    required: true,
  })
  @Post('/login')
  @HttpCode(200)
  login(@Body() user: LoginDto, @Request() req) {
    const agent = Useragent.parse(req.headers['user-agent']);
    const os = agent.os.toJSON().family;
    const browser = agent.toAgent();
    const clientInfo = {
      userAgent: req.headers['user-agent'],
      ipaddr: req.ip,
      browser: browser,
      os: os,
      loginLocation: '',
    };
    return this.mainService.login(user, clientInfo);
  }
}
