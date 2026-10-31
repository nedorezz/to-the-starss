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

export interface AuthUser {
  email: string;
  name?: string | null;
  provider?: string;
}

export interface CapsuleInfo {
  id: string;
  title: string | null;
  deliverAt: string;
  createdAt: string;
  locked: boolean;
  message?: string;
}

export interface DreamStarInfo {
  id: string;
  text: string;
  color: string;
  x: number;
  y: number;
  createdAt: string;
}
