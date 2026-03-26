-- Ügyfelek
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  website TEXT,
  business_type TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auditok
CREATE TABLE audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  url TEXT NOT NULL,
  audit_level TEXT DEFAULT 'szint1',
  status TEXT DEFAULT 'pending',
  error_message TEXT,

  modules JSONB DEFAULT '{
    "geo_seo": {"crawler_access": true, "schema_markup": true, "technical_seo": true, "citability": true, "brand_mentions": true, "platform_check": true, "llmstxt": true},
    "marketing": {"content_quality": true, "conversion": true, "competitor": true, "brand_trust": false},
    "compliance": {"gdpr": true, "hungarian_legal": true, "accessibility": true, "pci_dss": true, "can_spam": true},
    "sales": {"company_research": false, "contacts": false, "lead_scoring": false, "outreach": false}
  }',

  raw_html TEXT,
  technical_scan JSONB,
  compliance_scan JSONB,
  llm_analysis JSONB,
  audit_json JSONB,
  validation_result JSONB,

  geo_score INT,
  marketing_score INT,
  compliance_score INT,
  compliance_grade TEXT,
  sales_score INT,

  pdf_path TEXT,
  pdf_generated_at TIMESTAMPTZ,

  partner_data JSONB,

  processing_time_ms INT,
  llm_tokens_used INT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- White-label config
CREATE TABLE audit_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  company_name TEXT DEFAULT 'WebLelet',
  company_tagline TEXT DEFAULT 'AI-alapú weboldal elemző rendszer',
  primary_color TEXT DEFAULT '#2563EB',
  accent_color TEXT DEFAULT '#F59E0B',
  logo_url TEXT,
  contact_email TEXT DEFAULT 'info@weblelet.hu',
  contact_phone TEXT,
  contact_website TEXT DEFAULT 'https://weblelet.hu'
);

CREATE INDEX idx_audits_client ON audits(client_id);
CREATE INDEX idx_audits_status ON audits(status);
CREATE INDEX idx_audits_created ON audits(created_at DESC);

-- RLS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can do everything" ON clients FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can do everything on audits" ON audits FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can do everything on config" ON audit_config FOR ALL USING (auth.uid() IS NOT NULL);
