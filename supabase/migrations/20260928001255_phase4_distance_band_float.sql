-- Accept double-precision distances in the Phase 4 distance band (forward-only).
--
-- phase4_list_my_program_matches and phase4_match_program_volunteers compute
-- distances with acos()/sin() (double precision) and pass them to
-- phase4_distance_band(numeric). PostgreSQL does not cast double precision to
-- numeric implicitly in a function call, so volunteer matching failed with
-- "function phase4_distance_band(double precision) does not exist" whenever a
-- distance was computed. This overload delegates to the numeric definition.
BEGIN;

CREATE OR REPLACE FUNCTION public.phase4_distance_band(p_km double precision)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $function$
  SELECT public.phase4_distance_band(p_km::numeric);
$function$;

REVOKE ALL ON FUNCTION public.phase4_distance_band(double precision) FROM PUBLIC, anon, authenticated;

COMMIT;
