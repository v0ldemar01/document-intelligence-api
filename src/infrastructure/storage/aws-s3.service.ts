import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

@Injectable()
class AwsS3Service implements OnModuleInit {
  private readonly logger = new Logger(AwsS3Service.name);
  private readonly client: S3Client;
  private readonly endpoint: string | undefined;
  private readonly region: string;
  readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket =
      this.config.get<string>('storage.s3.bucket') ?? 'document-intelligence';
    this.region = this.config.get<string>('storage.s3.region') ?? 'us-east-1';
    this.endpoint = this.config.get<string>('storage.s3.endpoint');

    this.client = new S3Client({
      region: this.region,
      ...(this.endpoint && {
        endpoint: this.endpoint,
        forcePathStyle:
          this.config.get<boolean>('storage.s3.forcePathStyle') ?? true,
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    const endpoint = this.config.get<string>('storage.s3.endpoint');
    if (!endpoint) {
      // Real AWS — bucket is provisioned externally; skip auto-create
      return;
    }

    const exists = await this.client
      .send(new HeadBucketCommand({ Bucket: this.bucket }))
      .then(() => true)
      .catch(() => false);

    if (!exists) {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Created S3 bucket: ${this.bucket}`);
    }
  }

  async putObject(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  objectUri(key: string): string {
    return `s3://${this.bucket}/${key}`;
  }
}

export { AwsS3Service };
