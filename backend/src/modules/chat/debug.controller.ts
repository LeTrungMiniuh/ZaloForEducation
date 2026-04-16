import { Controller, Get } from "@nestjs/common";
import { DynamoDBService } from "../../infrastructure/dynamodb.service";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

@Controller("debug")
export class DebugController {
  constructor(private readonly db: DynamoDBService) {}

  @Get("scan")
  async scan() {
    const res = await this.db.docClient.send(new ScanCommand({
      TableName: this.db.tableName,
      Limit: 100
    }));
    return res.Items;
  }
}
