-- Idempotent internal renewal reminders and gated external-contact outbox.
BEGIN;
CREATE TABLE public.partnership_reminder_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), term_id uuid NOT NULL REFERENCES public.partnership_terms(id), threshold_days smallint NOT NULL CHECK(threshold_days IN(60,30,7)),
 recipient_user_id uuid REFERENCES public.users(id), contact_id uuid REFERENCES public.partner_contacts(id), channel text NOT NULL CHECK(channel IN('in_app','external_email')),
 delivery_key text NOT NULL UNIQUE, notification_id uuid REFERENCES public.notifications(id), outbox_id uuid REFERENCES public.partner_contact_email_outbox(id), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((channel='in_app')=(recipient_user_id IS NOT NULL)), CHECK((channel='external_email')=(contact_id IS NOT NULL))
);
ALTER TABLE public.partnership_reminder_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.partnership_reminder_deliveries FROM authenticated,anon;
CREATE POLICY phase2_service_only ON public.partnership_reminder_deliveries AS RESTRICTIVE FOR ALL TO authenticated USING(false) WITH CHECK(false);
CREATE TRIGGER partnership_reminder_deliveries_immutable BEFORE UPDATE OR DELETE ON public.partnership_reminder_deliveries FOR EACH ROW EXECUTE FUNCTION public.phase2_reject_immutable_change();

CREATE OR REPLACE FUNCTION public.phase2_generate_renewal_reminders() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE item record; recipient uuid; contact public.partner_contacts; notification uuid; outbox uuid; key text; created_count integer:=0; external_mode text;
BEGIN
 PERFORM public.phase2_assert_runtime('partners');
 SELECT mode INTO external_mode FROM public.phase2_component_runtime WHERE component='external_contact_email';
 FOR item IN SELECT t.id term_id,t.partner_id,t.expires_on,t.responsible_officer_id,p.name,(t.expires_on-current_date) threshold
  FROM public.partnership_terms t JOIN public.partner_entities p ON p.id=t.partner_id
  WHERE t.status='active' AND t.expires_on-current_date IN(60,30,7)
 LOOP
  FOR recipient IN SELECT DISTINCT id FROM public.users WHERE status='active' AND is_active IS TRUE AND (id=item.responsible_officer_id OR role='paraya_director') LOOP
   key:=item.term_id||':'||item.expires_on||':'||item.threshold||':'||recipient||':in_app';
   IF NOT EXISTS(SELECT 1 FROM public.partnership_reminder_deliveries WHERE delivery_key=key) THEN
    INSERT INTO public.notifications(user_id,type,title,message,action_url,is_read)
    VALUES(recipient,'reminder','Partnership renewal due',item.name||' expires in '||item.threshold||' days.','/officer/phase-2',false) RETURNING id INTO notification;
    INSERT INTO public.partnership_reminder_deliveries(term_id,threshold_days,recipient_user_id,channel,delivery_key,notification_id)
    VALUES(item.term_id,item.threshold,recipient,'in_app',key,notification); created_count:=created_count+1;
   END IF;
  END LOOP;
  SELECT * INTO contact FROM public.partner_contacts WHERE partner_id=item.partner_id AND is_primary AND active_until IS NULL AND status_email_opt_in ORDER BY created_at DESC LIMIT 1;
  IF contact.id IS NOT NULL THEN
   key:=item.term_id||':'||item.expires_on||':'||item.threshold||':'||contact.id||':external_email';
   IF NOT EXISTS(SELECT 1 FROM public.partnership_reminder_deliveries WHERE delivery_key=key) THEN
    INSERT INTO public.partner_contact_email_outbox(contact_id,template_key,template_version,payload,idempotency_key,status)
    VALUES(contact.id,'partnership_renewal',1,jsonb_build_object('partner_name',item.name,'expires_on',item.expires_on,'days',item.threshold),key,CASE WHEN external_mode='live' THEN 'queued' ELSE 'suppressed' END) RETURNING id INTO outbox;
    INSERT INTO public.partnership_reminder_deliveries(term_id,threshold_days,contact_id,channel,delivery_key,outbox_id)
    VALUES(item.term_id,item.threshold,contact.id,'external_email',key,outbox); created_count:=created_count+1;
   END IF;
  END IF;
 END LOOP;
 RETURN created_count;
END;$function$;
REVOKE ALL ON FUNCTION public.phase2_generate_renewal_reminders() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase2_generate_renewal_reminders() TO service_role;
COMMIT;
