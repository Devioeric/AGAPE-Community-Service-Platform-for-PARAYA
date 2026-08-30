BEGIN;
SELECT plan(8);

SELECT is(
  (SELECT title FROM public.community_needs WHERE id='f3300000-0000-4000-8000-000000000001'),
  'Synthetic learning need: aggregate planning evidence.',
  'legacy fixture receives an application title'
);
SELECT is(
  (SELECT priority FROM public.community_needs WHERE id='f3300000-0000-4000-8000-000000000001'),
  'high',
  'legacy priority score maps to the application priority'
);

INSERT INTO public.community_needs(
  id,barangay_id,submitted_by,category,title,description,priority,affected_count,sitio,approval_status
) VALUES (
  'f3300000-0000-4000-8000-000000000070','f2100000-0000-4000-8000-000000000001',
  'f2200000-0000-4000-8000-000000000007','health','Synthetic potable water need',
  'Synthetic description with no resident or contact data.','high',12,'Synthetic Sitio North','pending_captain'
);

SELECT is(
  (SELECT need_description FROM public.community_needs WHERE id='f3300000-0000-4000-8000-000000000070'),
  'Synthetic description with no resident or contact data.',
  'application description populates the foundational need description'
);
SELECT is(
  (SELECT priority_score FROM public.community_needs WHERE id='f3300000-0000-4000-8000-000000000070'),
  4::numeric,
  'application priority populates the foundational score'
);
SELECT is(
  (SELECT source FROM public.community_needs WHERE id='f3300000-0000-4000-8000-000000000070'),
  'assembly',
  'application submissions receive the bounded assembly source'
);
SELECT is(
  (SELECT assessment_date FROM public.community_needs WHERE id='f3300000-0000-4000-8000-000000000070'),
  (SELECT identified_date FROM public.community_needs WHERE id='f3300000-0000-4000-8000-000000000070'),
  'application and foundational assessment dates remain synchronized'
);

UPDATE public.community_needs SET resolved=true WHERE id='f3300000-0000-4000-8000-000000000070';
SELECT is(
  (SELECT status FROM public.community_needs WHERE id='f3300000-0000-4000-8000-000000000070'),
  'addressed',
  'resolving the application record updates the foundational status'
);

UPDATE public.community_needs SET priority_score=5 WHERE id='f3300000-0000-4000-8000-000000000070';
SELECT is(
  (SELECT priority FROM public.community_needs WHERE id='f3300000-0000-4000-8000-000000000070'),
  'critical',
  'foundational score changes update the application priority'
);

SELECT * FROM finish();
ROLLBACK;
