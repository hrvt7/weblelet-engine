// ═══ CORE TYPES ═══

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  business_type: string | null;
  notes: string | null;
  created_at: string;
}

export interface AuditModules {
  geo: {
    crawler_access: boolean;
    schema_markup: boolean;
    citability: boolean;
    brand_mentions: boolean;
    platform_check: boolean;
    llmstxt: boolean;
  };
  seo: {
    technical_seo: boolean;
    on_page: boolean;
    performance: boolean;
    crawlability: boolean;
    internal_linking: boolean;
  };
}

export type AuditLevel = "szint1" | "szint2";
export type AuditStatus = "pending" | "scanning" | "analyzing" | "validating" | "generating" | "completed" | "failed";

export interface Audit {
  id: string;
  client_id: string | null;
  url: string;
  audit_level: AuditLevel;
  status: AuditStatus;
  error_message: string | null;
  modules: AuditModules;
  raw_html: string | null;
  technical_scan: TechnicalScan | null;
  llm_analysis: LLMAnalysis | null;
  audit_json: AuditJSON | null;
  validation_result: ValidationResult | null;
  geo_score: number | null;
  seo_score: number | null;
  pdf_path: string | null;
  pdf_generated_at: string | null;
  partner_data: Record<string, unknown> | null;
  processing_time_ms: number | null;
  llm_tokens_used: number | null;
  created_at: string;
  updated_at: string;
}

export interface AuditConfig {
  id: string;
  user_id: string;
  company_name: string;
  company_tagline: string;
  primary_color: string;
  accent_color: string;
  logo_url: string | null;
  contact_email: string;
  contact_phone: string | null;
  contact_website: string;
}

// ═══ TECHNICAL SCAN ═══

export interface TechnicalScan {
  canonical: { found: boolean; url: string | null; matchesDomain: boolean };
  meta_title: { found: boolean; content: string | null; length: number };
  meta_description: { found: boolean; content: string | null; length: number; language: string | null };
  schema_markup: { found: boolean; types: string[]; jsonLd: string | null; fieldsCount: number };
  robots_txt: { found: boolean; content: string | null; aiCrawlers: Record<string, "allowed" | "blocked" | "not_mentioned"> };
  sitemap: { found: boolean; statusCode: number | null };
  https: boolean;
  lang_attr: string | null;
  headings: { h1: number; h2: number; h3: number; hierarchy_ok: boolean };
  images: { total: number; withoutAlt: number; withAlt: number };
  ga4: boolean;
  gtm: boolean;
  cookie_consent: { found: boolean; provider: string | null };
  open_graph: { found: boolean; tags: string[] };
  viewport: boolean;
  favicon: boolean;
}

// ═══ LLM ANALYSIS ═══

export interface Finding {
  severity: "KRITIKUS" | "MAGAS" | "KÖZEPES";
  tag: string; // "🔴 TÉNY" | "🟡 ERŐS FELTÉTELEZÉS" | "🟢 JAVASLAT"
  title: string;
  evidence: string;
  why_problem: string;
  business_impact: string;
  fix: string;
  fix_effort: string;
  priority: "MOST" | "30 NAP" | "KÉSŐBB";
}

export interface QuickWin {
  title: string;
  who: string;
  time: string;
  cost: string;
  type: "geo" | "seo" | "technikai";
}

export interface LLMAnalysis {
  findings: Finding[];
  layman_summary: string;
  strengths: string[];
  biggest_gaps: string[];
  fastest_fixes: string[];
  quick_wins: QuickWin[];
  schema_code: string | null;
  llms_txt: string | null;
}

// ═══ AUDIT JSON (final output) ═══

export interface AuditJSON {
  url: string;
  domain: string;
  brand_name: string;
  date: string;
  business_type: string;
  audit_level: AuditLevel;
  geo_score: number;
  seo_score: number;
  findings: Finding[];
  quick_wins: QuickWin[];
  strengths: string[];
  biggest_gaps: string[];
  fastest_fixes: string[];
  layman_summary: string;
  technical_scan: TechnicalScan;
  schema_code: string | null;
  llms_txt: string | null;
}

// ═══ VALIDATION ═══

export interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

// ═══ FETCH RESULT ═══

export interface FetchResult {
  url: string;
  html: string;
  statusCode: number;
  headers: Record<string, string>;
  subPages: Record<string, string>;
  robotsTxt: string | null;
  sitemapStatus: number | null;
}
