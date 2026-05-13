import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenRouter } from '@langchain/openrouter';
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
  AIMessage,
} from '@langchain/core/messages';

export interface TextPart {
  type: 'text';
  text: string;
}

export interface ImageUrlPart {
  type: 'image_url';
  image_url: { url: string };
}

export interface FileUrlPart {
  type: 'file_url';
  file_url: { url: string };
}

export type ContentPart = TextPart | ImageUrlPart | FileUrlPart;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface AiResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly model: ChatOpenRouter;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY') || '';
    const modelName =
      this.configService.get<string>('AI_MODEL') || 'google/gemini-2.5-flash';

    this.model = new ChatOpenRouter({
      model: modelName,
      apiKey,
      temperature: 0.7,
      maxTokens: 4096,
      siteUrl: 'https://zaloedu.app',
      siteName: 'ZaloEdu Bot',
    });
  }

  /** Expose the raw ChatOpenRouter model for building LangChain chains. */
  getModel(): ChatOpenRouter {
    return this.model;
  }

  async chat(messages: ChatMessage[]): Promise<AiResponse> {
    if (!this.configService.get<string>('OPENROUTER_API_KEY')) {
      throw new Error('OPENROUTER_API_KEY is not configured in .env');
    }

    try {
      const lcMessages: BaseMessage[] = messages.map((msg) =>
        this.toLangChainMessage(msg),
      );

      const response = await this.model.invoke(lcMessages);

      const text =
        typeof response.content === 'string'
          ? response.content
          : (response.content as any[])
              ?.map((c: any) => c.text ?? c.image_url?.url ?? '')
              .join('\n') ?? '';

      return {
        text: text.trim(),
        usage: {
          promptTokens: response.usage_metadata?.input_tokens ?? 0,
          completionTokens: response.usage_metadata?.output_tokens ?? 0,
        },
      };
    } catch (error) {
      this.logger.error('Failed to call OpenRouter API via LangChain', error);
      throw error;
    }
  }

  private toLangChainMessage(msg: ChatMessage): BaseMessage {
    const content = msg.content;

    switch (msg.role) {
      case 'system':
        return new SystemMessage(content);
      case 'user':
        return new HumanMessage(content);
      case 'assistant':
        return new AIMessage(content);
      default:
        return new HumanMessage(content);
    }
  }
}
