export type Category = 'hackathon' | 'giveaway' | 'portfolio' | 'other';

export interface Opportunity {
  title: string;
  description: string;
  url: string;
  source: string;
  deadline?: string;
  prize?: string;
  format?: string;
  level?: string;
  category: Category;
}

export interface DiscoverResponse {
  items: Opportunity[];
  summary: string;
  updatedAt: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
