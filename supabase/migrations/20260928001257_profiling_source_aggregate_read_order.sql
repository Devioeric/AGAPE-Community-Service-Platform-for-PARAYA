BEGIN;

-- Keep the imported document complete while making the paginated table useful:
-- quantitative rows and totals come first in stable source order.  This is a
-- forward-only correction because 20260928001256 is already applied to the
-- owned synthetic preview.
DO $guard$
BEGIN
  IF to_regprocedure('public.phase1_list_profiling_source_aggregate_rows(uuid,integer,integer)') IS NULL
     OR to_regclass('public.profiling_source_aggregate_rows') IS NULL THEN
    RAISE EXCEPTION 'profiling source aggregate read contract is missing';
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.phase1_list_profiling_source_aggregate_rows(
  p_dataset_id uuid,p_page integer DEFAULT 1,p_page_size integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE dataset public.profiling_source_aggregate_datasets%ROWTYPE; total_count integer; rows jsonb;
BEGIN
  IF p_page<1 OR p_page_size<1 OR p_page_size>500 THEN RAISE EXCEPTION 'invalid source aggregate page' USING ERRCODE='22023'; END IF;
  SELECT * INTO dataset FROM public.profiling_source_aggregate_datasets WHERE id=p_dataset_id;
  IF dataset.id IS NULL THEN RAISE EXCEPTION 'source aggregate dataset not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.phase1_assert_profiling_runtime(dataset.barangay_id);
  PERFORM public.phase1_assert_profiling_scope('profiling.aggregate.read',dataset.barangay_id,NULL);
  SELECT count(*)::integer INTO total_count FROM public.profiling_source_aggregate_rows WHERE dataset_id=p_dataset_id;
  SELECT coalesce(jsonb_agg(page_row.payload ORDER BY page_row.type_order,page_row.table_id,page_row.source_record_id),'[]'::jsonb) INTO rows
  FROM (
    SELECT
      CASE r.record_type WHEN 'quantitative_data' THEN 0 WHEN 'total' THEN 1 ELSE 2 END AS type_order,
      coalesce(r.table_id,'') AS table_id,
      r.source_record_id,
      jsonb_build_object(
        'id',r.id,'sourceRecordId',r.source_record_id,'recordType',r.record_type,'section',r.section,
        'subsection',r.subsection,'topic',r.topic,'category',r.category,'frequency',r.frequency,
        'percentage',r.percentage,'percentageAsPrinted',r.percentage_as_printed,
        'reportedTableTotal',r.reported_table_total,'multipleResponses',r.multiple_responses,
        'description',r.description,'representativeNotes',r.representative_notes,'sourcePage',r.source_page,
        'tableId',r.table_id,'originalTableHeader',r.original_table_header,
        'dataQualityNotes',r.data_quality_notes,'sourceFile',r.source_file
      ) AS payload
    FROM public.profiling_source_aggregate_rows r
    WHERE r.dataset_id=p_dataset_id
    ORDER BY type_order,coalesce(r.table_id,''),r.source_record_id
    OFFSET (p_page-1)*p_page_size LIMIT p_page_size
  ) AS page_row;
  RETURN jsonb_build_object(
    'datasetId',dataset.id,'cycleId',dataset.cycle_id,'barangayId',dataset.barangay_id,'sitioId',dataset.sitio_id,
    'sourceTitle',dataset.source_title,'sourceLocation',dataset.source_location,'status',dataset.status,
    'qualityFlags',dataset.quality_flags,'provenance',dataset.provenance,'rows',rows,
    'pagination',jsonb_build_object('page',p_page,'pageSize',p_page_size,'total',total_count,'totalPages',ceil(total_count::numeric/p_page_size)::integer)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.phase1_list_profiling_source_aggregate_rows(uuid,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase1_list_profiling_source_aggregate_rows(uuid,integer,integer) TO authenticated;

COMMIT;
