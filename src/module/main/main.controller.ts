import { Controller, Post } from '@nestjs/common';

@Controller('/')
export class MainController {
  @Post('/login')
  login() {
    return '/login';
  }
}
