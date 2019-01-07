import * as bcrypt from 'bcrypt';
import { sign } from 'jsonwebtoken';
import { Service } from "typedi";
import { Repository } from "typeorm";
import { InjectRepository } from "typeorm-typedi-extensions";
import { TokenObject } from "../../common/objects/Token.object";
import { User } from "../entities/User.entity";
import { LoginErrors } from "../enums/LoginErrors.enum";
import { RefreshTokenErrors } from '../enums/RefreshTokenErrors.enum';
import { SignupErrors } from '../enums/SignupErrors.enum';
import { RefreshTokenService } from "./RefreshToken.service";

@Service()
export class AuthTokenService {
  constructor (
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly refreshTokenService: RefreshTokenService
  ) {}

  async issue (
    email: string,
    password: string,
    clientIdentifier: string
  ): Promise<TokenObject|LoginErrors> {
    const user = await this.userRepository.findOne({
      email
    });
    if (!user) {
      return LoginErrors.USER_NOT_FOUND;
    }

    const correctPassword = await bcrypt.compare(password, user.password);

    if (!correctPassword) {
      return LoginErrors.INVALID_PASSWORD;
    }
    return this.userToTokenObject(user, clientIdentifier);
  }

  async refresh (
    refreshToken: string,
    clientIdentifier: string
  ): Promise<RefreshTokenErrors|TokenObject> {
    const lastToken = await this.refreshTokenService.tokenIsValid(refreshToken, clientIdentifier);

    if (!lastToken) {
      return RefreshTokenErrors.TOKEN_MISMATCH;
    }

    return this.userToTokenObject(lastToken.user, clientIdentifier);
  }

  async createUser (
    email: string,
    password: string,
    clientIdentifier: string
  ): Promise<TokenObject|SignupErrors> {
    const existingUser = await this.userRepository.findOne({
      email
    });

    if (existingUser) {
      return SignupErrors.USER_EXISTS;
    }

    const hashedPass = await bcrypt.hash(password, 10);

    let user = this.userRepository.create({
      email,
      password: hashedPass
    });

    user = await this.userRepository.save(user);

    return this.userToTokenObject(user, clientIdentifier);
  }

  private async userToTokenObject(user: User, clientIdentifier: string) {
    const authTokenEntity = await this.userToJwt(user);
    const authToken = authTokenEntity.token;
    const authTokenExpiration = authTokenEntity.expiration;
    const refreshTokenEntity = await this.refreshTokenService.issueRefreshToken(user.id, clientIdentifier);
    const refreshToken = refreshTokenEntity.refreshToken;
    const refreshTokenExpiration = refreshTokenEntity.expiration;
    return {
      authToken,
      authTokenExpiration,
      refreshToken,
      refreshTokenExpiration
    };
  }

  private userToJwt (
    user: User
  ) {
    return new Promise<{token: string; expiration: Date;}>((resolve, reject) => {
      const expiration = new Date(Date.now() + 300);
      const userWithoutPass = {
        ...user
      };
      delete userWithoutPass.password;
      sign(userWithoutPass, 'thuper_thecret', {
        expiresIn: 300
      }, (error, token) => {
        if (error) {
          return reject(error);
        }
        resolve({ expiration, token });
      });
    });
  }
}
