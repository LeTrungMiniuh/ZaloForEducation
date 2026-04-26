import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl = 'https://openrouter.ai/api/v1/chat/completions';

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENROUTER_API_KEY') || '';
    this.model = this.configService.get<string>('AI_MODEL') || 'google/gemini-2.5-flash-lite';
  }

  async chat(messages: ChatMessage[]): Promise<AiResponse> {
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured in .env');
    }

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://zaloedu.app',
          'X-Title': 'ZaloEdu Bot',
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          max_tokens: 4096,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(`OpenRouter API error (${response.status}): ${errorBody}`);
        throw new Error(`AI API returned ${response.status}: ${errorBody}`);
      }

      const data = await response.json() as any;
      const text = data.choices?.[0]?.message?.content || '';

      return {
        text: text.trim(),
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
        },
      };
    } catch (error) {
      this.logger.error('Failed to call OpenRouter API', error);
      throw error;
    }
  }
}
