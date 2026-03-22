import { Body, Controller, Param, Patch, Post } from "@nestjs/common";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { Public } from "@/decorator/customize.decorator";
import { UserInfo } from "@/decorator/customize.decorator";
import { User } from "./user.domain";
import { UploadAvatarDto } from "./dto/upload-avatar.dto";
import { AssignRoleDto } from "./dto/assign-role.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

@Controller('user')
export class UsersController {
    constructor(private usersService: UsersService) { }

    @Post('admin')
    @Public()
    createAdmin(@Body() createUserDto: CreateUserDto) {
        return this.usersService.createAdmin(createUserDto)
    }

    @Patch('avatar')
    uploadAvatar(@Body() uploadavatarDto: UploadAvatarDto, @UserInfo() user: User) {
        return this.usersService.uploadAvatar(uploadavatarDto.imageUrl, uploadavatarDto.publicId, user);
    }

    @Patch('role')
    assignRole(
        @Body() assignRoleDto: AssignRoleDto
    ) {
        return this.assignRole(assignRoleDto);
    }

    @Patch('reset-password/:id')
    resetPassword(
        @Param('id') id: string,
        @Body() body: { newPassword: string }
    ) {
        return this.usersService.resetPasswordById(id, body.newPassword);
    }

    @Patch(':id')
    updateProfile(
        @Param('id') id: string,
        @Body() updateUserDto: UpdateUserDto
    ) {
        return this.usersService.updateProfile(id, updateUserDto);
    }
}