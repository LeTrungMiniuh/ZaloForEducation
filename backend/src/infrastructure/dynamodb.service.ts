import { Injectable, OnModuleInit } from '@nestjs/common';
import { DynamoDBClient, CreateTableCommand, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DynamoDBService implements OnModuleInit {
  private client: DynamoDBClient;
  public docClient: DynamoDBDocumentClient;
  
  public get tableName(): string {
    return this.configService.get<string>('DYNAMODB_TABLE_NAME') || 'ZaloEduTable';
  }

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION') || 'ap-southeast-1';
    const endpoint = this.configService.get<string>('DYNAMODB_ENDPOINT'); // Nếu không có, SDK sẽ tự dùng AWS Cloud endpoint

    this.client = new DynamoDBClient({
      region,
      endpoint,
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID') || '',
        secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || '',
      },
    });
    this.docClient = DynamoDBDocumentClient.from(this.client);
  }

  async onModuleInit() {
    await this.initializeTable();
  }

  private async initializeTable() {
    try {
      const listTables = await this.client.send(new ListTablesCommand({}));
      if (listTables.TableNames?.includes(this.tableName)) {
        console.log(`Table ${this.tableName} already exists.`);
        return;
      }

      const command = new CreateTableCommand({
        TableName: this.tableName,
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' }, // Partition Key
          { AttributeName: 'SK', KeyType: 'RANGE' }, // Sort Key
        ],
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5,
        },
      });

      await this.client.send(command);
      console.log(`Table ${this.tableName} created successfully.`);
    } catch (error) {
      const errorName = error?.name || error?.__type;
      if (errorName === 'UnrecognizedClientException') {
        console.warn(
          `[DynamoDB] Skipping table bootstrap because AWS credentials are not valid for ${this.tableName}.`,
        );
        return;
      }

      console.error('Error initializing DynamoDB table:', error);
    }
  }
}
