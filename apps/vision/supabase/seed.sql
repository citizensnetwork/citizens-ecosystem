-- Seed data for development
-- Run with: supabase db reset (applies migrations then seed)

-- Insert test organisation
INSERT INTO public.organisations (id, name, slug, description, created_by)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'Demo Organisation',
  'demo-org',
  'A demonstration organisation for development and testing.',
  '00000000-0000-4000-8000-000000000000'
) ON CONFLICT (slug) DO NOTHING;

-- Insert a child department
INSERT INTO public.departments (id, org_id, name, description)
VALUES (
  '00000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-000000000001',
  'Operations',
  'Day-to-day operations department'
) ON CONFLICT DO NOTHING;

INSERT INTO public.departments (id, org_id, name, description, parent_department_id)
VALUES (
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000001',
  'Field Team',
  'On-the-ground field operations',
  '00000000-0000-4000-8000-000000000010'
) ON CONFLICT DO NOTHING;
