-- Phase 4: consented volunteer matching and secure program invitations.
-- Both runtime components remain off after migration.
BEGIN;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE public.phase4_component_runtime (
  component text PRIMARY KEY CHECK (component IN ('volunteer_matching','program_invitations')),
  mode text NOT NULL DEFAULT 'off' CHECK (mode IN ('off','synthetic','live')),
  synthetic_user_ids uuid[] NOT NULL DEFAULT '{}',
  synthetic_program_ids uuid[] NOT NULL DEFAULT '{}',
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  updated_by uuid REFERENCES public.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.phase4_component_runtime(component)
VALUES ('volunteer_matching'),('program_invitations');

CREATE TABLE public.volunteer_program_requirements (
  program_id uuid PRIMARY KEY REFERENCES public.programs(id) ON DELETE RESTRICT,
  required_skills text[] NOT NULL DEFAULT '{}',
  allowed_courses text[] NOT NULL DEFAULT '{}',
  minimum_year_level integer CHECK (minimum_year_level BETWEEN 1 AND 6),
  maximum_year_level integer CHECK (maximum_year_level BETWEEN 1 AND 6),
  signup_deadline timestamptz,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  updated_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (minimum_year_level IS NULL OR maximum_year_level IS NULL OR minimum_year_level<=maximum_year_level)
);

CREATE TABLE public.volunteer_program_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE RESTRICT,
  barangay_id uuid NOT NULL REFERENCES public.barangays(id) ON DELETE RESTRICT,
  sitio_id uuid REFERENCES public.barangay_sitios(id) ON DELETE RESTRICT,
  venue_name text NOT NULL CHECK (char_length(btrim(venue_name)) BETWEEN 1 AND 160),
  latitude numeric(8,5) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(8,5) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at>starts_at),
  radius_km numeric(6,2) NOT NULL DEFAULT 5 CHECK (radius_km BETWEEN 0.5 AND 100),
  is_primary boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  row_version bigint NOT NULL DEFAULT 1,
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX volunteer_program_sites_primary
  ON public.volunteer_program_sites(program_id) WHERE is_primary AND is_active;

CREATE TABLE public.volunteer_matching_profiles (
  volunteer_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE RESTRICT,
  skill_codes text[] NOT NULL DEFAULT '{}',
  availability jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(availability)='array'),
  base_barangay_id uuid REFERENCES public.barangays(id) ON DELETE RESTRICT,
  base_sitio_id uuid REFERENCES public.barangay_sitios(id) ON DELETE RESTRICT,
  approximate_latitude numeric(5,2) CHECK (approximate_latitude BETWEEN -90 AND 90),
  approximate_longitude numeric(6,2) CHECK (approximate_longitude BETWEEN -180 AND 180),
  location_consent_status text NOT NULL DEFAULT 'not_provided'
    CHECK (location_consent_status IN ('not_provided','active','withdrawn')),
  location_consented_at timestamptz,
  location_withdrawn_at timestamptz,
  row_version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((approximate_latitude IS NULL)=(approximate_longitude IS NULL))
);

CREATE TABLE public.volunteer_program_leaders (
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE RESTRICT,
  volunteer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  appointed_by uuid NOT NULL REFERENCES public.users(id),
  appointed_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  row_version bigint NOT NULL DEFAULT 1,
  PRIMARY KEY(program_id,volunteer_id)
);

CREATE TABLE public.volunteer_invitation_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  label text CHECK (label IS NULL OR char_length(label)<=80),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','revoked','exhausted')),
  expires_at timestamptz NOT NULL,
  max_uses integer NOT NULL CHECK (max_uses BETWEEN 1 AND 10000),
  use_count integer NOT NULL DEFAULT 0 CHECK (use_count BETWEEN 0 AND max_uses),
  allowed_email_domain text NOT NULL DEFAULT 'dyci.edu.ph',
  allow_external_email boolean NOT NULL DEFAULT false,
  external_exception_reason text,
  row_version bigint NOT NULL DEFAULT 1,
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_by uuid REFERENCES public.users(id),
  revoked_at timestamptz,
  revocation_reason text,
  CHECK (expires_at>created_at AND expires_at<=created_at+interval '7 days'),
  CHECK ((NOT allow_external_email AND external_exception_reason IS NULL)
    OR (allow_external_email AND char_length(btrim(external_exception_reason)) BETWEEN 10 AND 500))
);
CREATE INDEX volunteer_invitation_links_program ON public.volunteer_invitation_links(program_id,created_at DESC);

CREATE TABLE public.volunteer_invitation_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invitation_id uuid NOT NULL REFERENCES public.volunteer_invitation_links(id) ON DELETE RESTRICT,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'created','resolved','registered','joined','waitlisted','waitlist_approved',
    'waitlist_declined','failed','revoked','exhausted'
  )),
  actor_id uuid REFERENCES public.users(id),
  volunteer_id uuid REFERENCES public.users(id),
  recipient_email_hash text CHECK (recipient_email_hash IS NULL OR recipient_email_hash ~ '^[0-9a-f]{64}$'),
  reason_code text,
  metadata jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.volunteer_program_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid REFERENCES public.volunteer_invitation_links(id) ON DELETE RESTRICT,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE RESTRICT,
  volunteer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (reason IN ('capacity_full','eligibility_review')),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','approved','declined','cancelled')),
  row_version bigint NOT NULL DEFAULT 1,
  reviewed_by uuid REFERENCES public.users(id),
  reviewed_at timestamptz,
  review_remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX volunteer_program_waitlist_pending
  ON public.volunteer_program_waitlist(program_id,volunteer_id) WHERE state='pending';

CREATE OR REPLACE FUNCTION public.phase2_role_has_capability(p_role text,p_capability text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
 SELECT public.phase1_role_has_capability(p_role,p_capability) OR CASE
  WHEN p_role='paraya_director' THEN p_capability=ANY(ARRAY[
   'partner.contact.read','partner.contact.manage','partner.document.read','partner.document.manage','partner.renew','partner.policy.manage','partner.legacy_mapping.manage',
   'historical_program.read','historical_program.create','historical_program.import','historical_program.review',
   'proposal.catalog.manage','proposal.submit','proposal.evidence.confirm','proposal.handoff','budget.read','budget.prepare','budget.category.manage',
   'ai.recommendation.review','ai.recommendation.configure','volunteer.match.read','volunteer.invitation.manage','volunteer.waitlist.review'])
  WHEN p_role='paraya_associate' THEN p_capability=ANY(ARRAY[
   'partner.contact.read','partner.contact.manage','partner.document.read','partner.document.manage','partner.renew',
   'historical_program.read','historical_program.create','historical_program.import','proposal.submit','proposal.handoff','budget.read','budget.prepare','budget.actual.record',
   'volunteer.match.read','volunteer.invitation.manage','volunteer.waitlist.review'])
  WHEN p_role='paraya_researcher' THEN p_capability=ANY(ARRAY[
   'partner.contact.read','partner.contact.manage','partner.document.read','partner.document.manage','partner.renew',
   'historical_program.read','historical_program.create','historical_program.import','historical_program.review',
   'proposal.submit','proposal.evidence.confirm','proposal.handoff','budget.read','budget.prepare','budget.actual.record',
   'ai.recommendation.review','volunteer.match.read','volunteer.invitation.manage','volunteer.waitlist.review'])
  WHEN p_role='finance_officer' THEN p_capability=ANY(ARRAY['budget.read','budget.review','budget.liquidation.review'])
  WHEN p_role IN('barangay_captain','barangay_secretary') THEN p_capability='historical_program.read'
  WHEN p_role='volunteer' THEN p_capability='volunteer.preferences.manage'
  ELSE false END;
$function$;

CREATE OR REPLACE FUNCTION public.phase4_get_my_preferences()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE p public.volunteer_matching_profiles;
BEGIN
 PERFORM public.phase4_assert_actor_runtime('volunteer_matching');
 IF NOT public.phase2_current_has_capability('volunteer.preferences.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.volunteer_matching_profiles WHERE volunteer_id=auth.uid();
 RETURN jsonb_build_object('rowVersion',coalesce(p.row_version,0),'skills',coalesce(p.skill_codes,'{}'),
   'availability',coalesce(p.availability,'[]'),'location',jsonb_build_object(
   'consentStatus',coalesce(p.location_consent_status,'not_provided'),'barangayId',p.base_barangay_id,
   'sitioId',p.base_sitio_id,'hasApproximatePoint',p.approximate_latitude IS NOT NULL,
   'approximateLatitude',p.approximate_latitude::text,'approximateLongitude',p.approximate_longitude::text));
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase4_set_my_preferences(p_payload jsonb,p_expected_version bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE old public.volunteer_matching_profiles; saved public.volunteer_matching_profiles; item jsonb;
 skills text[]; availability jsonb; loc jsonb; consent boolean; barangay_id uuid; sitio_id uuid; lat numeric; lon numeric;
 allowed constant text[]:=ARRAY['community_facilitation','data_collection','documentation','education_tutoring','event_management',
   'first_aid','food_preparation','graphic_design','logistics','performing_arts','photography_video','public_speaking',
   'social_media','sports_coaching','technology_support','writing_editing'];
BEGIN
 PERFORM public.phase4_assert_actor_runtime('volunteer_matching');
 IF NOT public.phase2_current_has_capability('volunteer.preferences.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN('skills','availability','location'))
   OR jsonb_typeof(p_payload->'skills')<>'array' OR jsonb_array_length(p_payload->'skills')>16
   OR jsonb_typeof(p_payload->'availability')<>'array' OR jsonb_array_length(p_payload->'availability')>28
   OR jsonb_typeof(p_payload->'location')<>'object' THEN RAISE EXCEPTION 'invalid preference payload' USING ERRCODE='22023'; END IF;
 SELECT coalesce(array_agg(DISTINCT value ORDER BY value),'{}') INTO skills FROM jsonb_array_elements_text(p_payload->'skills');
 IF EXISTS(SELECT 1 FROM unnest(skills) s WHERE NOT s=ANY(allowed)) THEN RAISE EXCEPTION 'invalid skill code' USING ERRCODE='22023'; END IF;
 availability:=p_payload->'availability';
 FOR item IN SELECT value FROM jsonb_array_elements(availability) LOOP
   IF jsonb_typeof(item)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN('dayOfWeek','startTime','endTime'))
     OR (item->>'dayOfWeek')::integer NOT BETWEEN 0 AND 6 OR (item->>'startTime')::time >= (item->>'endTime')::time
   THEN RAISE EXCEPTION 'invalid availability' USING ERRCODE='22023'; END IF;
 END LOOP;
 loc:=p_payload->'location';
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(loc) k WHERE k NOT IN('consent','barangayId','sitioId','approximateLatitude','approximateLongitude'))
 THEN RAISE EXCEPTION 'invalid location payload' USING ERRCODE='22023'; END IF;
 consent:=coalesce((loc->>'consent')::boolean,false);
 barangay_id:=nullif(loc->>'barangayId','')::uuid; sitio_id:=nullif(loc->>'sitioId','')::uuid;
 lat:=nullif(loc->>'approximateLatitude','')::numeric; lon:=nullif(loc->>'approximateLongitude','')::numeric;
 IF sitio_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.barangay_sitios s WHERE s.id=sitio_id AND s.barangay_id=barangay_id AND s.is_active)
 THEN RAISE EXCEPTION 'sitio does not belong to barangay' USING ERRCODE='23514'; END IF;
 IF (lat IS NULL)<>(lon IS NULL) THEN RAISE EXCEPTION 'approximate point must be complete' USING ERRCODE='22023'; END IF;
 IF NOT consent AND (barangay_id IS NOT NULL OR sitio_id IS NOT NULL OR lat IS NOT NULL OR lon IS NOT NULL)
 THEN RAISE EXCEPTION 'location data requires consent' USING ERRCODE='22023'; END IF;
 SELECT * INTO old FROM public.volunteer_matching_profiles WHERE volunteer_id=auth.uid() FOR UPDATE;
 IF old.volunteer_id IS NULL AND p_expected_version IS NOT NULL OR old.volunteer_id IS NOT NULL AND old.row_version<>p_expected_version
 THEN RAISE EXCEPTION 'stale preference version' USING ERRCODE='40001'; END IF;
 INSERT INTO public.volunteer_matching_profiles(volunteer_id,skill_codes,availability,base_barangay_id,base_sitio_id,
   approximate_latitude,approximate_longitude,location_consent_status,location_consented_at,location_withdrawn_at)
 VALUES(auth.uid(),skills,availability,CASE WHEN consent THEN barangay_id END,CASE WHEN consent THEN sitio_id END,CASE WHEN consent THEN round(lat,2) END,
   CASE WHEN consent THEN round(lon,2) END,CASE WHEN consent THEN 'active' WHEN old.location_consent_status='active' THEN 'withdrawn' ELSE 'not_provided' END,
   CASE WHEN consent THEN coalesce(old.location_consented_at,now()) END,
   CASE WHEN NOT consent AND old.location_consent_status='active' THEN now() ELSE old.location_withdrawn_at END)
 ON CONFLICT(volunteer_id) DO UPDATE SET skill_codes=excluded.skill_codes,availability=excluded.availability,
   base_barangay_id=excluded.base_barangay_id,base_sitio_id=excluded.base_sitio_id,
   approximate_latitude=excluded.approximate_latitude,approximate_longitude=excluded.approximate_longitude,
   location_consent_status=excluded.location_consent_status,location_consented_at=excluded.location_consented_at,
   location_withdrawn_at=excluded.location_withdrawn_at,row_version=public.volunteer_matching_profiles.row_version+1,updated_at=now()
 RETURNING * INTO saved;
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,metadata)
 VALUES(auth.uid(),'volunteer.matching_preferences.updated','volunteer',auth.uid()::text,
   jsonb_build_object('rowVersion',saved.row_version,'skills',cardinality(saved.skill_codes),
   'availability',jsonb_array_length(saved.availability),'locationConsent',saved.location_consent_status));
 RETURN public.phase4_get_my_preferences();
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase4_get_program_matching_setup(p_program_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE r public.volunteer_program_requirements; s public.volunteer_program_sites;
BEGIN
 PERFORM public.phase4_assert_actor_runtime('volunteer_matching',p_program_id);
 IF NOT public.phase2_current_has_capability('volunteer.match.read') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.volunteer_program_requirements WHERE program_id=p_program_id;
 SELECT * INTO s FROM public.volunteer_program_sites WHERE program_id=p_program_id AND is_primary AND is_active;
 RETURN jsonb_build_object('programId',p_program_id,'rowVersion',coalesce(r.row_version,0),
   'requiredSkills',coalesce(r.required_skills,'{}'),'allowedCourses',coalesce(r.allowed_courses,'{}'),
   'minimumYearLevel',r.minimum_year_level,'maximumYearLevel',r.maximum_year_level,'signupDeadline',r.signup_deadline,
   'site',CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('id',s.id,'venueName',s.venue_name,
   'barangayId',s.barangay_id,'sitioId',s.sitio_id,'latitude',s.latitude::text,'longitude',s.longitude::text,
   'startsAt',s.starts_at,'endsAt',s.ends_at,'radiusKm',s.radius_km::text) END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase4_set_program_matching_setup(p_program_id uuid,p_payload jsonb,p_expected_version bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE old public.volunteer_program_requirements; p public.programs; loc jsonb; skills text[]; courses text[];
 allowed constant text[]:=ARRAY['community_facilitation','data_collection','documentation','education_tutoring','event_management',
   'first_aid','food_preparation','graphic_design','logistics','performing_arts','photography_video','public_speaking',
   'social_media','sports_coaching','technology_support','writing_editing'];
BEGIN
 PERFORM public.phase4_assert_actor_runtime('volunteer_matching',p_program_id);
 IF NOT public.phase2_current_has_capability('volunteer.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_payload IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN(
   'requiredSkills','allowedCourses','minimumYearLevel','maximumYearLevel','signupDeadline','site'))
   OR jsonb_typeof(p_payload->'site')<>'object' THEN RAISE EXCEPTION 'invalid setup payload' USING ERRCODE='22023'; END IF;
 SELECT * INTO p FROM public.programs WHERE id=p_program_id FOR UPDATE;
 IF p.id IS NULL OR p.status IN('completed','cancelled') THEN RAISE EXCEPTION 'program is not editable' USING ERRCODE='23514'; END IF;
 SELECT coalesce(array_agg(DISTINCT value ORDER BY value),'{}') INTO skills FROM jsonb_array_elements_text(p_payload->'requiredSkills');
 SELECT coalesce(array_agg(DISTINCT btrim(value) ORDER BY btrim(value)),'{}') INTO courses FROM jsonb_array_elements_text(p_payload->'allowedCourses');
 IF cardinality(skills)>16 OR EXISTS(SELECT 1 FROM unnest(skills) s WHERE NOT s=ANY(allowed)) OR cardinality(courses)>30
 THEN RAISE EXCEPTION 'invalid matching requirements' USING ERRCODE='22023'; END IF;
 loc:=p_payload->'site';
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(loc) k WHERE k NOT IN('venueName','barangayId','sitioId','latitude','longitude','startsAt','endsAt','radiusKm'))
   OR (loc->>'startsAt')::timestamptz >= (loc->>'endsAt')::timestamptz OR (loc->>'barangayId')::uuid<>p.barangay_id
 THEN RAISE EXCEPTION 'invalid program site' USING ERRCODE='23514'; END IF;
 IF nullif(loc->>'sitioId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.barangay_sitios s
   WHERE s.id=(loc->>'sitioId')::uuid AND s.barangay_id=p.barangay_id AND s.is_active)
 THEN RAISE EXCEPTION 'site sitio does not belong to program barangay' USING ERRCODE='23514'; END IF;
 SELECT * INTO old FROM public.volunteer_program_requirements WHERE program_id=p_program_id FOR UPDATE;
 IF old.program_id IS NULL AND p_expected_version IS NOT NULL OR old.program_id IS NOT NULL AND old.row_version<>p_expected_version
 THEN RAISE EXCEPTION 'stale setup version' USING ERRCODE='40001'; END IF;
 INSERT INTO public.volunteer_program_requirements(program_id,required_skills,allowed_courses,minimum_year_level,maximum_year_level,signup_deadline,updated_by)
 VALUES(p_program_id,skills,courses,nullif(p_payload->>'minimumYearLevel','')::integer,nullif(p_payload->>'maximumYearLevel','')::integer,
   nullif(p_payload->>'signupDeadline','')::timestamptz,auth.uid())
 ON CONFLICT(program_id) DO UPDATE SET required_skills=excluded.required_skills,allowed_courses=excluded.allowed_courses,
   minimum_year_level=excluded.minimum_year_level,maximum_year_level=excluded.maximum_year_level,
   signup_deadline=excluded.signup_deadline,updated_by=auth.uid(),updated_at=now(),
   row_version=public.volunteer_program_requirements.row_version+1;
 UPDATE public.volunteer_program_sites SET is_primary=false,is_active=false,updated_at=now(),row_version=row_version+1
 WHERE program_id=p_program_id AND is_primary AND is_active;
 INSERT INTO public.volunteer_program_sites(program_id,barangay_id,sitio_id,venue_name,latitude,longitude,starts_at,ends_at,radius_km,created_by)
 VALUES(p_program_id,(loc->>'barangayId')::uuid,nullif(loc->>'sitioId','')::uuid,btrim(loc->>'venueName'),
   (loc->>'latitude')::numeric,(loc->>'longitude')::numeric,(loc->>'startsAt')::timestamptz,(loc->>'endsAt')::timestamptz,
   (loc->>'radiusKm')::numeric,auth.uid());
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,metadata)
 VALUES(auth.uid(),'program.volunteer_matching.configured','program',p_program_id::text,
   jsonb_build_object('skillCount',cardinality(skills),'courseCount',cardinality(courses)));
 RETURN public.phase4_get_program_matching_setup(p_program_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase4_distance_band(p_km numeric)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
 SELECT CASE WHEN p_km IS NULL THEN 'not_available' WHEN p_km<1 THEN 'under_1_km'
   WHEN p_km<3 THEN '1_to_3_km' WHEN p_km<5 THEN '3_to_5_km' WHEN p_km<10 THEN '5_to_10_km' ELSE 'over_10_km' END;
$function$;

CREATE OR REPLACE FUNCTION public.phase4_match_program_volunteers(p_program_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE result jsonb;
BEGIN
 PERFORM public.phase4_assert_actor_runtime('volunteer_matching',p_program_id);
 IF NOT public.phase2_current_has_capability('volunteer.match.read') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 WITH ctx AS (
   SELECT r.*,s.latitude site_lat,s.longitude site_lon,s.starts_at,s.ends_at,s.radius_km
   FROM public.volunteer_program_requirements r JOIN public.volunteer_program_sites s
   ON s.program_id=r.program_id AND s.is_primary AND s.is_active WHERE r.program_id=p_program_id
 ), c AS (
   SELECT u.id,u.full_name,u.email,v.course,v.year_level,x.required_skills,x.radius_km,
    (cardinality(x.allowed_courses)=0 OR v.course=ANY(x.allowed_courses))
      AND (x.minimum_year_level IS NULL OR v.year_level>=x.minimum_year_level)
      AND (x.maximum_year_level IS NULL OR v.year_level<=x.maximum_year_level) eligible,
    (SELECT count(*) FROM unnest(x.required_skills) skill WHERE skill=ANY(coalesce(mp.skill_codes,'{}'))) skill_match,
    CASE WHEN jsonb_array_length(coalesce(mp.availability,'[]'))=0 THEN 'not_recorded'
      WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(mp.availability) a
       WHERE (a->>'dayOfWeek')::int=extract(dow FROM x.starts_at)::int
       AND (a->>'startTime')::time<=x.starts_at::time AND (a->>'endTime')::time>=x.ends_at::time)
       AND NOT EXISTS(SELECT 1 FROM public.volunteer_class_schedules cs WHERE cs.volunteer_id=u.id
       AND cs.day_of_week=extract(dow FROM x.starts_at)::int AND cs.start_time<x.ends_at::time AND cs.end_time>x.starts_at::time)
      THEN 'available' ELSE 'unavailable' END availability_state,
    CASE WHEN mp.location_consent_status='active' AND mp.approximate_latitude IS NOT NULL THEN
      6371*acos(least(1,greatest(-1,cos(radians(x.site_lat))*cos(radians(mp.approximate_latitude))
      *cos(radians(mp.approximate_longitude)-radians(x.site_lon))+sin(radians(x.site_lat))*sin(radians(mp.approximate_latitude))))) END km
   FROM ctx x JOIN public.users u ON u.role='volunteer' AND u.status='active' AND u.is_active
   JOIN public.volunteers v ON v.user_id=u.id AND v.status='active'
   LEFT JOIN public.volunteer_matching_profiles mp ON mp.volunteer_id=u.id
   JOIN public.phase4_component_runtime rt ON rt.component='volunteer_matching'
   WHERE rt.mode<>'synthetic' OR (u.is_synthetic_test AND u.id=ANY(rt.synthetic_user_ids))
 ), ranked AS (
   SELECT *,row_number() OVER(ORDER BY eligible DESC,skill_match DESC,
    CASE availability_state WHEN 'available' THEN 0 WHEN 'not_recorded' THEN 1 ELSE 2 END,km NULLS LAST,id) rank FROM c
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('rank',rank,'volunteerId',id,'name',full_name,'email',email,
  'course',course,'yearLevel',year_level,'eligible',eligible,'matchedSkillCount',skill_match,
  'requiredSkillCount',cardinality(required_skills),'availability',availability_state,
  'withinRadius',CASE WHEN km IS NULL THEN NULL ELSE km<=radius_km END,'distanceBand',public.phase4_distance_band(km)) ORDER BY rank),'[]')
 INTO result FROM ranked;
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,metadata)
 VALUES(auth.uid(),'program.volunteer_matches.read','program',p_program_id::text,jsonb_build_object('count',jsonb_array_length(result)));
 RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase4_assert_actor_runtime(p_component text,p_program_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE cfg public.phase4_component_runtime; actor public.users; program_mode text;
BEGIN
 IF p_component NOT IN('volunteer_matching','program_invitations') THEN RAISE EXCEPTION 'unknown component' USING ERRCODE='22023'; END IF;
 SELECT * INTO cfg FROM public.phase4_component_runtime WHERE component=p_component;
 IF cfg.component IS NULL OR cfg.mode='off' THEN RAISE EXCEPTION 'Phase 4 component is off' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM public.users WHERE id=auth.uid();
 IF actor.id IS NULL OR actor.status<>'active' OR actor.is_active IS NOT TRUE THEN RAISE EXCEPTION 'inactive actor' USING ERRCODE='42501'; END IF;
 IF cfg.mode='synthetic' AND (actor.is_synthetic_test IS NOT TRUE OR NOT actor.id=ANY(cfg.synthetic_user_ids)) THEN
   RAISE EXCEPTION 'actor is not synthetic-allowlisted' USING ERRCODE='42501';
 END IF;
 IF p_program_id IS NOT NULL THEN
   SELECT phase2_data_mode INTO program_mode FROM public.programs WHERE id=p_program_id;
   IF program_mode IS NULL OR program_mode<>cfg.mode OR
      (cfg.mode='synthetic' AND NOT p_program_id=ANY(cfg.synthetic_program_ids)) THEN
     RAISE EXCEPTION 'program is outside the active data mode' USING ERRCODE='42501';
   END IF;
 END IF;
 RETURN cfg.mode;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase4_configure_component(
 p_component text,p_mode text,p_synthetic_user_ids uuid[],p_synthetic_program_ids uuid[],p_expected_version bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE current_row public.phase4_component_runtime; saved public.phase4_component_runtime;
BEGIN
 IF (SELECT role FROM public.users WHERE id=auth.uid())<>'paraya_director'
    OR NOT public.phase2_current_has_capability('volunteer.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_component NOT IN('volunteer_matching','program_invitations') OR p_mode NOT IN('off','synthetic','live') THEN
   RAISE EXCEPTION 'invalid runtime configuration' USING ERRCODE='22023';
 END IF;
 SELECT * INTO current_row FROM public.phase4_component_runtime WHERE component=p_component FOR UPDATE;
 IF current_row.row_version<>p_expected_version THEN RAISE EXCEPTION 'stale runtime version' USING ERRCODE='40001'; END IF;
 UPDATE public.phase4_component_runtime SET mode=p_mode,synthetic_user_ids=coalesce(p_synthetic_user_ids,'{}'),
   synthetic_program_ids=coalesce(p_synthetic_program_ids,'{}'),row_version=row_version+1,
   updated_by=auth.uid(),updated_at=now() WHERE component=p_component RETURNING * INTO saved;
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,metadata)
 VALUES(auth.uid(),'phase4.runtime.configured','phase4_component',p_component,jsonb_build_object('mode',p_mode,'rowVersion',saved.row_version));
 RETURN jsonb_build_object('component',saved.component,'mode',saved.mode,'rowVersion',saved.row_version);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase4_list_my_program_matches()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE result jsonb;
BEGIN
 PERFORM public.phase4_assert_actor_runtime('volunteer_matching');
 IF NOT public.phase2_current_has_capability('volunteer.preferences.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 WITH me AS (
   SELECT u.id,v.course,v.year_level,mp.skill_codes,mp.availability,mp.location_consent_status,
    mp.approximate_latitude,mp.approximate_longitude
   FROM public.users u JOIN public.volunteers v ON v.user_id=u.id
   LEFT JOIN public.volunteer_matching_profiles mp ON mp.volunteer_id=u.id WHERE u.id=auth.uid()
 ), rows AS (
   SELECT p.id,p.title,p.description,p.status,p.start_date,p.end_date,p.max_volunteers,b.name barangay,
    (SELECT count(*) FROM public.program_signups ps WHERE ps.program_id=p.id AND ps.status<>'withdrawn') signup_count,
    (SELECT jsonb_build_object('id',ps.id,'status',ps.status) FROM public.program_signups ps
      WHERE ps.program_id=p.id AND ps.volunteer_id=auth.uid() AND ps.status<>'withdrawn') my_signup,
    (cardinality(r.allowed_courses)=0 OR me.course=ANY(r.allowed_courses))
      AND (r.minimum_year_level IS NULL OR me.year_level>=r.minimum_year_level)
      AND (r.maximum_year_level IS NULL OR me.year_level<=r.maximum_year_level) eligible,
    (SELECT count(*) FROM unnest(r.required_skills) skill WHERE skill=ANY(coalesce(me.skill_codes,'{}'))) skill_match,
    cardinality(r.required_skills) skill_total,
    CASE WHEN jsonb_array_length(coalesce(me.availability,'[]'))=0 THEN 'not_recorded'
      WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(me.availability) a
       WHERE (a->>'dayOfWeek')::int=extract(dow FROM s.starts_at)::int
       AND (a->>'startTime')::time<=s.starts_at::time AND (a->>'endTime')::time>=s.ends_at::time)
       AND NOT EXISTS(SELECT 1 FROM public.volunteer_class_schedules cs WHERE cs.volunteer_id=me.id
       AND cs.day_of_week=extract(dow FROM s.starts_at)::int AND cs.start_time<s.ends_at::time AND cs.end_time>s.starts_at::time)
      THEN 'available' ELSE 'unavailable' END availability_state,
    CASE WHEN me.location_consent_status='active' AND me.approximate_latitude IS NOT NULL THEN
      6371*acos(least(1,greatest(-1,cos(radians(s.latitude))*cos(radians(me.approximate_latitude))
      *cos(radians(me.approximate_longitude)-radians(s.longitude))+sin(radians(s.latitude))*sin(radians(me.approximate_latitude))))) END km,
    s.radius_km
   FROM public.programs p JOIN public.barangays b ON b.id=p.barangay_id
   JOIN public.volunteer_program_requirements r ON r.program_id=p.id
   JOIN public.volunteer_program_sites s ON s.program_id=p.id AND s.is_primary AND s.is_active
   CROSS JOIN me JOIN public.phase4_component_runtime rt ON rt.component='volunteer_matching'
   WHERE p.status IN('planning','upcoming','active') AND p.phase2_data_mode=rt.mode
     AND (rt.mode<>'synthetic' OR p.id=ANY(rt.synthetic_program_ids))
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'description',description,'status',status,
  'startDate',start_date,'endDate',end_date,'maxVolunteers',max_volunteers,'signupCount',signup_count,
  'mySignup',my_signup,'barangay',barangay,'eligible',eligible,'matchedSkillCount',skill_match,
  'requiredSkillCount',skill_total,'availability',availability_state,
  'withinRadius',CASE WHEN km IS NULL THEN NULL ELSE km<=radius_km END,'distanceBand',public.phase4_distance_band(km))
  ORDER BY eligible DESC,skill_match DESC,CASE availability_state WHEN 'available' THEN 0 WHEN 'not_recorded' THEN 1 ELSE 2 END,
  km NULLS LAST,id),'[]') INTO result FROM rows;
 RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase4_create_program_invitation(
 p_program_id uuid,p_token_hash text,p_label text,p_expires_at timestamptz,p_max_uses integer,
 p_allowed_email_domain text,p_allow_external_email boolean,p_external_exception_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE p public.programs; r public.volunteer_program_requirements; i public.volunteer_invitation_links; remaining integer;
BEGIN
 PERFORM public.phase4_assert_actor_runtime('program_invitations',p_program_id);
 IF NOT (public.phase2_current_has_capability('volunteer.invitation.manage') OR
   public.phase2_current_has_capability('volunteer.self') AND EXISTS(SELECT 1 FROM public.volunteer_program_leaders l
   WHERE l.program_id=p_program_id AND l.volunteer_id=auth.uid() AND l.active))
 THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF p_token_hash !~ '^[0-9a-f]{64}$' OR p_expires_at<=now() OR p_expires_at>now()+interval '7 days'
  OR p_max_uses NOT BETWEEN 1 AND 10000 OR lower(p_allowed_email_domain)!~'^[a-z0-9.-]+\.[a-z]{2,}$'
 THEN RAISE EXCEPTION 'invalid invitation' USING ERRCODE='22023'; END IF;
 SELECT * INTO p FROM public.programs WHERE id=p_program_id FOR UPDATE;
 SELECT * INTO r FROM public.volunteer_program_requirements WHERE program_id=p_program_id;
 IF p.status NOT IN('planning','upcoming','active') OR r.signup_deadline IS NOT NULL AND p_expires_at>r.signup_deadline
 THEN RAISE EXCEPTION 'program is unavailable for this invitation' USING ERRCODE='23514'; END IF;
 remaining:=CASE WHEN p.max_volunteers IS NULL THEN 10000 ELSE greatest(0,p.max_volunteers-
  (SELECT count(*) FROM public.program_signups s WHERE s.program_id=p.id AND s.status<>'withdrawn')) END;
 IF remaining=0 OR p_max_uses>remaining THEN RAISE EXCEPTION 'invitation exceeds remaining capacity' USING ERRCODE='23514'; END IF;
 IF p_allow_external_email AND ((SELECT role FROM public.users WHERE id=auth.uid())<>'paraya_director'
   OR p_external_exception_reason IS NULL OR char_length(btrim(p_external_exception_reason))<10)
 THEN RAISE EXCEPTION 'Director exception required' USING ERRCODE='42501'; END IF;
 INSERT INTO public.volunteer_invitation_links(program_id,token_hash,label,expires_at,max_uses,allowed_email_domain,
   allow_external_email,external_exception_reason,created_by)
 VALUES(p.id,p_token_hash,nullif(btrim(p_label),''),p_expires_at,p_max_uses,lower(p_allowed_email_domain),
   p_allow_external_email,CASE WHEN p_allow_external_email THEN btrim(p_external_exception_reason) END,auth.uid())
 RETURNING * INTO i;
 INSERT INTO public.volunteer_invitation_events(invitation_id,program_id,event_type,actor_id,metadata)
 VALUES(i.id,p.id,'created',auth.uid(),jsonb_build_object('expiresAt',i.expires_at,'maxUses',i.max_uses));
 RETURN jsonb_build_object('id',i.id,'programId',i.program_id,'label',i.label,'state',i.state,'expiresAt',i.expires_at,
   'maxUses',i.max_uses,'useCount',i.use_count,'rowVersion',i.row_version);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase4_list_program_invitations(p_program_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE result jsonb;
BEGIN
 PERFORM public.phase4_assert_actor_runtime('program_invitations',p_program_id);
 IF NOT (public.phase2_current_has_capability('volunteer.invitation.manage') OR EXISTS(SELECT 1 FROM public.volunteer_program_leaders l
   WHERE l.program_id=p_program_id AND l.volunteer_id=auth.uid() AND l.active))
 THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label,
  'state',CASE WHEN state='active' AND expires_at<=now() THEN 'expired' ELSE state END,
  'expiresAt',expires_at,'maxUses',max_uses,'useCount',use_count,'allowedEmailDomain',allowed_email_domain,
  'allowExternalEmail',allow_external_email,'rowVersion',row_version,'createdAt',created_at) ORDER BY created_at DESC),'[]')
 INTO result FROM public.volunteer_invitation_links WHERE program_id=p_program_id;
 RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase4_list_program_leaders(p_program_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE result jsonb; version bigint;
BEGIN
 PERFORM public.phase4_assert_actor_runtime('program_invitations',p_program_id);
 IF NOT public.phase2_current_has_capability('volunteer.invitation.manage') THEN
   RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
 END IF;
 SELECT row_version INTO version FROM public.volunteer_program_requirements WHERE program_id=p_program_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'volunteerId',l.volunteer_id,'name',u.full_name,'course',v.course,'yearLevel',v.year_level
 ) ORDER BY u.full_name,l.volunteer_id),'[]')
 INTO result
 FROM public.volunteer_program_leaders l
 JOIN public.users u ON u.id=l.volunteer_id
 JOIN public.volunteers v ON v.user_id=l.volunteer_id
 WHERE l.program_id=p_program_id AND l.active;
 RETURN jsonb_build_object('rowVersion',coalesce(version,0),'leaders',result);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase4_set_program_leaders(
 p_program_id uuid,p_volunteer_ids uuid[],p_expected_version bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE req public.volunteer_program_requirements; cfg public.phase4_component_runtime; ids uuid[];
BEGIN
 PERFORM public.phase4_assert_actor_runtime('program_invitations',p_program_id);
 IF NOT public.phase2_current_has_capability('volunteer.manage') THEN
   RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
 END IF;
 ids:=coalesce(p_volunteer_ids,'{}');
 IF cardinality(ids)>10 OR cardinality(ids)<>(SELECT count(DISTINCT value) FROM unnest(ids) value) THEN
   RAISE EXCEPTION 'invalid program leaders' USING ERRCODE='22023';
 END IF;
 PERFORM 1 FROM public.programs WHERE id=p_program_id FOR UPDATE;
 SELECT * INTO req FROM public.volunteer_program_requirements WHERE program_id=p_program_id FOR UPDATE;
 IF req.program_id IS NULL OR req.row_version<>p_expected_version THEN
   RAISE EXCEPTION 'stale matching setup' USING ERRCODE='40001';
 END IF;
 SELECT * INTO cfg FROM public.phase4_component_runtime WHERE component='program_invitations';
 IF EXISTS(
   SELECT 1 FROM unnest(ids) target
   WHERE NOT EXISTS(
     SELECT 1 FROM public.users u
     JOIN public.volunteers v ON v.user_id=u.id AND v.status='active'
     JOIN public.program_signups s ON s.volunteer_id=u.id AND s.program_id=p_program_id
       AND s.status='confirmed' AND s.approval_status='approved'
     WHERE u.id=target AND u.role='volunteer' AND u.status='active' AND u.is_active
       AND (cfg.mode<>'synthetic' OR u.is_synthetic_test AND u.id=ANY(cfg.synthetic_user_ids))
   )
 ) THEN RAISE EXCEPTION 'leader must be an active assigned volunteer in the active data mode' USING ERRCODE='23514'; END IF;
 UPDATE public.volunteer_program_leaders
 SET active=false,ended_at=now(),row_version=row_version+1
 WHERE program_id=p_program_id AND active AND NOT volunteer_id=ANY(ids);
 INSERT INTO public.volunteer_program_leaders(program_id,volunteer_id,appointed_by)
 SELECT p_program_id,value,auth.uid() FROM unnest(ids) value
 ON CONFLICT(program_id,volunteer_id) DO UPDATE
 SET active=true,appointed_by=auth.uid(),appointed_at=now(),ended_at=NULL,
   row_version=public.volunteer_program_leaders.row_version+1
 WHERE NOT public.volunteer_program_leaders.active;
 UPDATE public.volunteer_program_requirements
 SET row_version=row_version+1,updated_by=auth.uid(),updated_at=now()
 WHERE program_id=p_program_id RETURNING * INTO req;
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,metadata)
 VALUES(auth.uid(),'program.volunteer_leaders.updated','program',p_program_id::text,
   jsonb_build_object('leaderCount',cardinality(ids),'rowVersion',req.row_version));
 RETURN public.phase4_list_program_leaders(p_program_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase4_revoke_program_invitation(p_invitation_id uuid,p_expected_version bigint,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE i public.volunteer_invitation_links;
BEGIN
 SELECT * INTO i FROM public.volunteer_invitation_links WHERE id=p_invitation_id FOR UPDATE;
 IF i.id IS NULL THEN RAISE EXCEPTION 'invitation not found' USING ERRCODE='P0002'; END IF;
 PERFORM public.phase4_assert_actor_runtime('program_invitations',i.program_id);
 IF NOT (public.phase2_current_has_capability('volunteer.invitation.manage') OR
   public.phase2_current_has_capability('volunteer.self') AND EXISTS(
     SELECT 1 FROM public.volunteer_program_leaders l
     WHERE l.program_id=i.program_id AND l.volunteer_id=auth.uid() AND l.active
   ))
   OR i.row_version<>p_expected_version OR i.state<>'active'
 THEN RAISE EXCEPTION 'forbidden or stale invitation' USING ERRCODE='40001'; END IF;
 UPDATE public.volunteer_invitation_links SET state='revoked',revoked_by=auth.uid(),revoked_at=now(),
  revocation_reason=left(nullif(btrim(p_reason),''),500),row_version=row_version+1 WHERE id=i.id RETURNING * INTO i;
 INSERT INTO public.volunteer_invitation_events(invitation_id,program_id,event_type,actor_id,reason_code)
 VALUES(i.id,i.program_id,'revoked',auth.uid(),'manual_revocation');
 RETURN jsonb_build_object('id',i.id,'state',i.state,'rowVersion',i.row_version);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase4_resolve_invitation(p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE i public.volunteer_invitation_links; p public.programs; cfg public.phase4_component_runtime; enrolled integer;
BEGIN
 IF p_token_hash !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
 SELECT * INTO cfg FROM public.phase4_component_runtime WHERE component='program_invitations';
 IF cfg.component IS NULL OR cfg.mode='off' THEN RETURN NULL; END IF;
 SELECT * INTO i FROM public.volunteer_invitation_links WHERE token_hash=p_token_hash;
 SELECT * INTO p FROM public.programs WHERE id=i.program_id;
 IF i.id IS NULL OR p.phase2_data_mode<>cfg.mode OR cfg.mode='synthetic' AND NOT p.id=ANY(cfg.synthetic_program_ids) THEN RETURN NULL; END IF;
 SELECT count(*) INTO enrolled FROM public.program_signups s WHERE s.program_id=p.id AND s.status<>'withdrawn';
 RETURN jsonb_build_object('programId',p.id,'title',p.title,'status',p.status,'startsOn',p.start_date,'endsOn',p.end_date,
  'expiresAt',i.expires_at,'available',i.state='active' AND i.expires_at>now() AND i.use_count<i.max_uses
   AND p.status IN('planning','upcoming','active'),'capacityAvailable',p.max_volunteers IS NULL OR enrolled<p.max_volunteers,
  'requiresInstitutionalEmail',NOT i.allow_external_email,'allowedEmailDomain',i.allowed_email_domain);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase4_consume_invitation_for_user(p_token_hash text,p_user_id uuid,p_email_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE i public.volunteer_invitation_links; p public.programs; cfg public.phase4_component_runtime; u public.users;
 v public.volunteers; r public.volunteer_program_requirements; existing public.program_signups;
 existing_waitlist public.volunteer_program_waitlist; enrolled integer; eligible boolean; w uuid; signup_id uuid;
BEGIN
 IF p_token_hash !~ '^[0-9a-f]{64}$' OR p_email_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid invitation request' USING ERRCODE='22023'; END IF;
 SELECT * INTO i FROM public.volunteer_invitation_links WHERE token_hash=p_token_hash FOR UPDATE;
 IF i.id IS NULL OR i.state<>'active' OR i.expires_at<=now() OR i.use_count>=i.max_uses THEN RAISE EXCEPTION 'invitation unavailable' USING ERRCODE='23514'; END IF;
 SELECT * INTO cfg FROM public.phase4_component_runtime WHERE component='program_invitations';
 SELECT * INTO p FROM public.programs WHERE id=i.program_id FOR UPDATE;
 SELECT * INTO u FROM public.users WHERE id=p_user_id FOR UPDATE;
 SELECT * INTO v FROM public.volunteers WHERE user_id=p_user_id;
 SELECT * INTO r FROM public.volunteer_program_requirements WHERE program_id=p.id;
 IF cfg.mode='off' OR p.phase2_data_mode<>cfg.mode OR cfg.mode='synthetic' AND
  (u.is_synthetic_test IS NOT TRUE OR NOT u.id=ANY(cfg.synthetic_user_ids) OR NOT p.id=ANY(cfg.synthetic_program_ids))
 THEN RAISE EXCEPTION 'invitation outside active mode' USING ERRCODE='42501'; END IF;
 IF u.role<>'volunteer' OR u.email IS NULL OR NOT i.allow_external_email AND split_part(lower(u.email),'@',2)<>i.allowed_email_domain
 THEN RAISE EXCEPTION 'volunteer email is ineligible' USING ERRCODE='42501'; END IF;
 SELECT * INTO existing FROM public.program_signups WHERE program_id=p.id AND volunteer_id=u.id FOR UPDATE;
 IF existing.id IS NOT NULL AND existing.status<>'withdrawn' THEN
  RETURN jsonb_build_object('state','joined','programId',p.id,'signupId',existing.id,'idempotent',true);
 END IF;
 eligible:=v.user_id IS NOT NULL AND (cardinality(coalesce(r.allowed_courses,'{}'))=0 OR v.course=ANY(r.allowed_courses))
  AND (r.minimum_year_level IS NULL OR v.year_level>=r.minimum_year_level)
  AND (r.maximum_year_level IS NULL OR v.year_level<=r.maximum_year_level);
 SELECT count(*) INTO enrolled FROM public.program_signups s WHERE s.program_id=p.id AND s.status<>'withdrawn';
 UPDATE public.users SET status='active',is_active=true,updated_at=now() WHERE id=u.id;
 IF eligible AND (p.max_volunteers IS NULL OR enrolled<p.max_volunteers) THEN
  INSERT INTO public.program_signups(program_id,volunteer_id,status,approval_status,added_by,confirmed_at,approved_by,approved_at)
  VALUES(p.id,u.id,'confirmed','approved',i.created_by,now(),i.created_by,now())
  ON CONFLICT(program_id,volunteer_id) DO UPDATE SET status='confirmed',approval_status='approved',added_by=i.created_by,
   confirmed_at=now(),approved_by=i.created_by,approved_at=now(),approval_notes=NULL,signed_up_at=now()
  RETURNING id INTO signup_id;
  UPDATE public.volunteer_invitation_links SET use_count=use_count+1,
   state=CASE WHEN use_count+1>=max_uses THEN 'exhausted' ELSE state END,row_version=row_version+1
   WHERE id=i.id RETURNING * INTO i;
  INSERT INTO public.volunteer_invitation_events(invitation_id,program_id,event_type,actor_id,volunteer_id,recipient_email_hash)
  VALUES(i.id,p.id,'joined',u.id,u.id,p_email_hash);
  IF i.state='exhausted' THEN
    INSERT INTO public.volunteer_invitation_events(invitation_id,program_id,event_type,actor_id,reason_code)
    VALUES(i.id,p.id,'exhausted',u.id,'maximum_uses_reached');
  END IF;
  RETURN jsonb_build_object('state','joined','programId',p.id,'signupId',signup_id,'idempotent',false);
 END IF;
 SELECT * INTO existing_waitlist FROM public.volunteer_program_waitlist
 WHERE program_id=p.id AND volunteer_id=u.id AND state='pending' FOR UPDATE;
 IF existing_waitlist.id IS NOT NULL THEN
   RETURN jsonb_build_object('state','waitlisted','programId',p.id,'waitlistId',existing_waitlist.id,'idempotent',true);
 END IF;
 INSERT INTO public.volunteer_program_waitlist(invitation_id,program_id,volunteer_id,reason)
 VALUES(i.id,p.id,u.id,CASE WHEN eligible THEN 'capacity_full' ELSE 'eligibility_review' END)
 RETURNING id INTO w;
 UPDATE public.volunteer_invitation_links SET use_count=use_count+1,
  state=CASE WHEN use_count+1>=max_uses THEN 'exhausted' ELSE state END,row_version=row_version+1
  WHERE id=i.id RETURNING * INTO i;
 INSERT INTO public.volunteer_invitation_events(invitation_id,program_id,event_type,actor_id,volunteer_id,recipient_email_hash,reason_code)
 VALUES(i.id,p.id,'waitlisted',u.id,u.id,p_email_hash,CASE WHEN eligible THEN 'capacity_full' ELSE 'eligibility_review' END);
 IF i.state='exhausted' THEN
   INSERT INTO public.volunteer_invitation_events(invitation_id,program_id,event_type,actor_id,reason_code)
   VALUES(i.id,p.id,'exhausted',u.id,'maximum_uses_reached');
 END IF;
 RETURN jsonb_build_object('state','waitlisted','programId',p.id,'waitlistId',w,'idempotent',false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase4_list_program_waitlist(p_program_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE result jsonb;
BEGIN
 PERFORM public.phase4_assert_actor_runtime('program_invitations',p_program_id);
 IF NOT public.phase2_current_has_capability('volunteer.waitlist.review') THEN
   RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',w.id,'volunteerId',w.volunteer_id,'name',u.full_name,'course',v.course,
   'yearLevel',v.year_level,'reason',w.reason,'state',w.state,
   'rowVersion',w.row_version,'createdAt',w.created_at
 ) ORDER BY w.created_at,w.id),'[]')
 INTO result
 FROM public.volunteer_program_waitlist w
 JOIN public.users u ON u.id=w.volunteer_id
 JOIN public.volunteers v ON v.user_id=w.volunteer_id
 WHERE w.program_id=p_program_id AND w.state='pending';
 RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase4_review_waitlist(p_waitlist_id uuid,p_action text,p_expected_version bigint,p_remarks text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE w public.volunteer_program_waitlist; p public.programs; enrolled integer;
BEGIN
 SELECT * INTO w FROM public.volunteer_program_waitlist WHERE id=p_waitlist_id FOR UPDATE;
 IF w.id IS NULL THEN RAISE EXCEPTION 'waitlist request not found' USING ERRCODE='P0002'; END IF;
 PERFORM public.phase4_assert_actor_runtime('program_invitations',w.program_id);
 IF NOT public.phase2_current_has_capability('volunteer.waitlist.review') OR w.state<>'pending'
  OR w.row_version<>p_expected_version OR p_action NOT IN('approve','decline')
 THEN RAISE EXCEPTION 'forbidden or stale waitlist decision' USING ERRCODE='40001'; END IF;
 IF p_action='approve' THEN
  SELECT * INTO p FROM public.programs WHERE id=w.program_id FOR UPDATE;
  SELECT count(*) INTO enrolled FROM public.program_signups s WHERE s.program_id=p.id AND s.status<>'withdrawn';
  IF p.max_volunteers IS NOT NULL AND enrolled>=p.max_volunteers THEN RAISE EXCEPTION 'program is full' USING ERRCODE='23514'; END IF;
  INSERT INTO public.program_signups(program_id,volunteer_id,status,approval_status,added_by,confirmed_at,approved_by,approved_at)
  VALUES(p.id,w.volunteer_id,'confirmed','approved',auth.uid(),now(),auth.uid(),now())
  ON CONFLICT(program_id,volunteer_id) DO UPDATE SET status='confirmed',approval_status='approved',
   added_by=auth.uid(),confirmed_at=now(),approved_by=auth.uid(),approved_at=now(),approval_notes=NULL;
 END IF;
 UPDATE public.volunteer_program_waitlist SET state=CASE WHEN p_action='approve' THEN 'approved' ELSE 'declined' END,
  reviewed_by=auth.uid(),reviewed_at=now(),review_remarks=left(nullif(btrim(p_remarks),''),500),row_version=row_version+1
 WHERE id=w.id RETURNING * INTO w;
 INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,metadata)
 VALUES(auth.uid(),'program.waitlist.'||p_action,'volunteer_program_waitlist',w.id::text,
  jsonb_build_object('programId',w.program_id,'rowVersion',w.row_version));
 INSERT INTO public.volunteer_invitation_events(invitation_id,program_id,event_type,actor_id,volunteer_id,reason_code)
 VALUES(w.invitation_id,w.program_id,CASE WHEN p_action='approve' THEN 'waitlist_approved' ELSE 'waitlist_declined' END,
   auth.uid(),w.volunteer_id,'manual_review');
 RETURN jsonb_build_object('id',w.id,'state',w.state,'rowVersion',w.row_version);
END;
$function$;

CREATE TRIGGER volunteer_invitation_events_immutable BEFORE UPDATE OR DELETE ON public.volunteer_invitation_events
FOR EACH ROW EXECUTE FUNCTION public.phase2_reject_immutable_change();

DO $secure$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['phase4_component_runtime','volunteer_program_requirements','volunteer_program_sites',
  'volunteer_matching_profiles','volunteer_program_leaders','volunteer_invitation_links',
  'volunteer_invitation_events','volunteer_program_waitlist'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
  EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false)',t||'_rpc_only',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END;
$secure$;

REVOKE ALL ON FUNCTION public.phase4_assert_actor_runtime(text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase4_configure_component(text,text,uuid[],uuid[],bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase4_get_my_preferences() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase4_set_my_preferences(jsonb,bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase4_get_program_matching_setup(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase4_set_program_matching_setup(uuid,jsonb,bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase4_distance_band(numeric) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase4_match_program_volunteers(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase4_list_my_program_matches() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase4_create_program_invitation(uuid,text,text,timestamptz,integer,text,boolean,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase4_list_program_invitations(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase4_list_program_leaders(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase4_set_program_leaders(uuid,uuid[],bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase4_revoke_program_invitation(uuid,bigint,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase4_resolve_invitation(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase4_consume_invitation_for_user(text,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.phase4_list_program_waitlist(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.phase4_review_waitlist(uuid,text,bigint,text) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.phase4_configure_component(text,text,uuid[],uuid[],bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase4_get_my_preferences() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase4_set_my_preferences(jsonb,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase4_get_program_matching_setup(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase4_set_program_matching_setup(uuid,jsonb,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase4_match_program_volunteers(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase4_list_my_program_matches() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase4_create_program_invitation(uuid,text,text,timestamptz,integer,text,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase4_list_program_invitations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase4_list_program_leaders(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase4_set_program_leaders(uuid,uuid[],bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase4_revoke_program_invitation(uuid,bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase4_list_program_waitlist(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase4_review_waitlist(uuid,text,bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phase4_resolve_invitation(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.phase4_consume_invitation_for_user(text,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.phase1_permission_module_for_table(p_table text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
 SELECT CASE
  WHEN p_table='phase4_component_runtime' OR p_table='volunteer_invitation_events' THEN 'audit_logs'
  WHEN p_table LIKE 'volunteer_%' THEN 'volunteers'
  WHEN p_table LIKE 'proposal_budget_%' OR p_table='budget_categories'
    OR p_table='budget_review_events' OR p_table LIKE 'program_budget_%'
    OR p_table LIKE 'program_financial_%' OR p_table='program_expenditures'
    OR p_table LIKE 'liquidation_%' OR p_table='program_finance_events' THEN 'budgets'
  WHEN p_table LIKE 'partner_contact%' OR p_table LIKE 'partnership_%'
    OR p_table LIKE 'partner_entit%' OR p_table='partner_type_policies'
    OR p_table='legacy_account_partner_mappings' THEN 'partnerships'
  WHEN p_table LIKE 'historical_program%' THEN 'historical_programs'
  WHEN p_table LIKE 'proposal%' OR p_table IN('project_proposals','project_templates') THEN 'proposals'
  WHEN p_table LIKE 'program%' OR p_table='activity_photos' THEN 'programs'
  WHEN p_table IN('phase2_component_runtime','phase2_release_attestations','phase2_cutover_state') THEN 'audit_logs'
  WHEN p_table='users' THEN 'user_management' WHEN p_table='audit_logs' THEN 'audit_logs'
  WHEN p_table IN('barangays','partnership_history') THEN 'partnerships'
  WHEN p_table LIKE 'survey%' THEN 'surveys' WHEN p_table='community_needs' THEN 'community_needs'
  WHEN p_table='field_observations' THEN 'observations'
  WHEN p_table IN('community_skills','community_assets','barangay_skills','barangay_assets') THEN 'skills_assets'
  WHEN p_table='attendance' THEN 'attendance' WHEN p_table='activity_logs' THEN 'activity_logs'
  WHEN p_table LIKE 'donation%' THEN 'donations'
  WHEN p_table LIKE 'impact%' OR p_table LIKE 'qualitative_impact%' OR p_table LIKE 'follow_up%' THEN 'impact'
  WHEN p_table LIKE 'analytics%' THEN 'analytics'
  WHEN p_table LIKE 'ai_recommendation%' THEN 'ai_assistance'
  WHEN p_table LIKE 'ai_report%' THEN 'reports'
  WHEN p_table IN('notifications','forum_threads','forum_posts','forum_comments') THEN 'communication'
  WHEN p_table='domain_correction_events' OR p_table LIKE 'phase2_storage_read_event%' THEN 'audit_logs'
  WHEN p_table LIKE 'profiling%' OR p_table IN('barangay_sitios','mother_leader_sitio_assignments','official_population_snapshots','household_profiles','households','residents','household_memberships') THEN 'profiling'
  ELSE NULL
 END;
$function$;

COMMIT;
