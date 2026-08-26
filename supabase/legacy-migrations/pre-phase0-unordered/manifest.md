# Pre-Phase-0 unordered migration archive manifest

This directory is a non-executable historical archive. The 53 SQL files were
moved byte-for-byte from `supabase/migrations` after the validated PostgreSQL 17
authoritative capture selected the no-timestamped-migrations baseline branch and
the canonical baseline candidate reproduced the captured application schema.

- Capture ID: `AGAPE-STAGING-20260825-PACKET7`
- Canonical baseline: `20260815000000_pre_phase0_baseline.sql`
- Canonical baseline SHA-256: `e3d29ada8fa963f2af3dc7031a21575dd7d2d8a587d735b056c5d562ac1bce66`
- Timestamped migrations recorded in the captured ledger: `0`
- Archive file count: `53`
- Deployment history: `unknown` unless stated otherwise; an empty timestamped
  ledger does not prove whether a legacy SQL-editor artifact was executed.

The canonical baseline, not these files, is the replay authority. Do not pass
this directory to `supabase db push`, `supabase db reset`, or a SQL batch runner.

| Original filename | SHA-256 | Applied state | Disposition |
|---|---|---|---|
| `_COMBINED_pending.sql` | `5281dad175e7f344d5807f1824a2908d58b3433024e94ba57da325c8cfb5a843` | unknown | Excluded aggregate artifact overlapping 11 archived component files |
| `activity_logs_approval.sql` | `fc5d02656fdb7b8ad3898de6a5e07707fef587a8f29d4cc168324a33f0727b48` | unknown | Represented by canonical baseline; also embedded by `_COMBINED_pending.sql` |
| `activity_photos.sql` | `1af5c1585ae1cc3184c4f671f181473e52579024a98dfa66fb5f218a39361cdc` | unknown | Represented by canonical baseline |
| `ai_reports.sql` | `afb96aa5963874fd54f599334d72ffd701e706a2bbcc62fa91af18b2058edaee` | unknown | Represented by canonical baseline |
| `analytics_snapshots.sql` | `e6e52a3a8c31c50aba298dfab4ce95c09cee500b838f157925de204ab20987b0` | unknown | Represented by canonical baseline |
| `attendance.sql` | `44017d68f269f888b3bc6637d7414ad1a8ead37eeb03acb742850322fce35d6c` | unknown | Represented by canonical baseline |
| `audit_logs_columns.sql` | `8c47b798a01f5187ff720912afb52a20d5be0d58f809718f580a3235ac49e0c0` | unknown | Represented by canonical baseline |
| `barangay_coordinates.sql` | `f69ece1da23b9f8f6d86b014cb22ad8c03df820060e1c9ccd477fb3330c1378b` | unknown | Represented by canonical baseline |
| `barangays_extra_columns.sql` | `fbf816df88815ca66efd96b0ca59de1554cdfbaac35fb28c09d7b846981f1629` | unknown | Represented by canonical baseline |
| `community_needs_approval.sql` | `163884e3b586f6cee401bed1eb61434a0be2249fb4d8d5e146f17f31584377df` | unknown | Represented by canonical baseline |
| `field_observations.sql` | `28493bef8b11be57fbe89c436ea3b395e484bfab631b96b4a434cef73bb28061` | unknown | Represented by canonical baseline |
| `finance_officer_role.sql` | `98c4d77edbab7645aab8b8d042fc3b149290c8815ff8a56361f51ff70979b0e4` | unknown | Superseded conflicting `users_role_check`; canonical baseline is authoritative |
| `follow_up_immediate.sql` | `e66fd9085dd56edd30c542d9b00b73f05a7a6cc417dc2a82392249c406f51f08` | unknown | Represented by canonical baseline |
| `forum.sql` | `6cef4995eb2b38238e9856c5a134800e72f011f8a4cd6a0241295c9ba53f8ba1` | unknown | Represented by canonical baseline |
| `household_profile_extended.sql` | `1b762fe044dbd8fed0eccd6d43379319c0c9fac6fb046dc874c9caf52bff185b` | unknown | Represented by canonical baseline |
| `household_profiles_family_name_nullable.sql` | `da7f671d85b0e149f33b1e27e96feeac36bab52dad2f5b450727837699a69595` | unknown | Represented by canonical baseline; also embedded by `_COMBINED_pending.sql` |
| `household_profiles.sql` | `d688bd36457171683a947fdc707a570721a054d84f15e7c64f5da9ab1141d76c` | unknown | Represented by canonical baseline |
| `partner_roles_expansion.sql` | `1ec05bc1b25d36cf094a8ba3746fb31f2c4aa41ca263d106bf4e8a179eafb557` | unknown | Superseded conflicting `users_role_check`; canonical baseline is authoritative |
| `partnership_history.sql` | `b8534b4ad89dd32792df80ea3208554dee44fd0be6fcd6ff6b2efd9de2c66b13` | unknown | Represented by canonical baseline |
| `program_activities_created_by.sql` | `f3b5769a64075371db1ff790fd6ba8fcf74048235b3a1901757df5ace28857e6` | unknown | Represented by canonical baseline; also embedded by `_COMBINED_pending.sql` |
| `program_activities_report_columns.sql` | `dee0c3f8c9a4cf0751f573c05f968ee69b1fe00be662d65232f3a0baa26ad342` | unknown | Represented by canonical baseline; also embedded by `_COMBINED_pending.sql` |
| `program_activities_status_check.sql` | `6dc0e0d6d3e889599f6b0f273e20aedb30f3c60c7d41fe7b2d0b89bbb2e9ceb3` | unknown | Represented by canonical baseline; also embedded by `_COMBINED_pending.sql` |
| `program_activities_timestamps.sql` | `7cf796197ca09fd01747ee7574619febc2c3666acf8ee499cbb0d7d4cb54c1ab` | unknown | Represented by canonical baseline; also embedded by `_COMBINED_pending.sql` |
| `program_budgets_drop_unique_program.sql` | `1a4c0c64e49ebd8a8ac24bf4b7284164836b117c96cc31e5c2fa67ebbe3ac04c` | unknown | Represented by canonical baseline; also embedded by `_COMBINED_pending.sql` |
| `program_budgets_rename_amount_columns.sql` | `712f00c5297b95d901cf9672d474d0e497b6656945a6363138e866a8656a5a46` | unknown | Represented by canonical baseline |
| `program_budgets_schema_alignment.sql` | `ff8e42433a1233d7c1616103e8750a14e07e5d1987ebb815f415abf1310df700` | unknown | Represented by canonical baseline; also embedded by `_COMBINED_pending.sql` |
| `program_item_approvals.sql` | `528158e938fbe4d108e64b1e087b1101e96064d2e45b6e9eb698493a2b692a5f` | unknown | Represented by canonical baseline |
| `program_signups_status_check.sql` | `a4714efc0e2496b49f166637b6a7a13232c78cc80c466e0a86334060746069e0` | unknown | Represented by canonical baseline; also embedded by `_COMBINED_pending.sql` |
| `proposal_community_validation.sql` | `98c454543565d2531e8f608b512d895e6c1959106ef07f54a9adeab5c5a65539` | unknown | Represented by canonical baseline |
| `proposal_gatekeeping.sql` | `553210cf9af5849ecba8f7eeb816663be1f6dc2f022a31c20d9e31ddbc72aa31` | unknown | Represented by canonical baseline |
| `proposal_informed_by.sql` | `a0633f0ca7a8b3164132926d55040a515f97a28db7de7ddd835d1430b003ccb2` | unknown | Represented by canonical baseline |
| `proposal_revisions.sql` | `8af0d4f35b8acf5f838e8def4d8a05f8ea866370f27aea7dfb4dfd5e911d18b8` | unknown | Represented by canonical baseline |
| `proposal_validation_links_relax_threshold.sql` | `73d9c572e67493b8f4593280b5ddca673009741691250053ca56f52cb80120ee` | unknown | Represented by canonical baseline |
| `proposal_validation_links.sql` | `ab948b63f168247b663f946f46f8b23b4f4e0055d265937cdeeac06c4dc34d7f` | unknown | Represented by canonical baseline |
| `proposal_validations_evidence.sql` | `e3f7e2f478c27dfdbfe0e5c4fcb72df7ff94b74b6588b2f60bcdf45348cc45b2` | unknown | Represented by canonical baseline |
| `proposals_rls_expansion.sql` | `7cccb70de5f5af08d621dc5bda6eb74f3a231ad016491a45756f670328e6e7c1` | unknown | Represented by canonical baseline; also embedded by `_COMBINED_pending.sql` |
| `rls_expansion_remaining_tables.sql` | `5321c1118c42c8cb57b3592ae1ef32ebeaf90693a1683c9bc41449068053b65c` | unknown | Represented by canonical baseline; also embedded by `_COMBINED_pending.sql` |
| `role_expansion.sql` | `2fd36ca9a25f4d1bf25176f9e5b24e895702d301ccf0f1c1212c9dba7b676403` | unknown | Superseded conflicting `users_role_check`; canonical baseline is authoritative |
| `sitio_columns.sql` | `c83e155ed8ea882253e2b2221b74eea4a7c88037d05ec0794e1b2563c484a98a` | unknown | Represented by canonical baseline |
| `skills_and_assets.sql` | `2331ebd0fd7eab41b1affa61244a1509a86417087002b0598032d4d30c7429a2` | unknown | Represented by canonical baseline |
| `survey_answer_codes.sql` | `d5922d6e183285278b0849c989c2b2868056198556a7b0d4d7b87ddc974c3532` | unknown | Represented by canonical baseline |
| `survey_builder_v2.sql` | `1285322ee796cbb1bbd8b527e8a5c8764fc465599d0af55cc10c52bf508c88a3` | unknown | Represented by canonical baseline |
| `survey_methodology.sql` | `d4737fe46825186ab17c74b11f73027655bcfe2104ada209e9b0f562de91b559` | unknown | Represented by canonical baseline |
| `survey_parent.sql` | `b8c04c48dc8e0f4d18e180415be969b25e18fc6be1d96cf094c2852abc626182` | unknown | Represented by canonical baseline |
| `survey_questions_type_check.sql` | `ad0fb28eada5b8e87912a974ac93329bc9107a724150d31ff69b3600881db273` | unknown | Represented by canonical baseline |
| `survey_response_scrubbing.sql` | `19084df0771a3e8dd70a1dda7d387ecf0bdad45692a51cf7acf168d497dd2fbf` | unknown | Represented by canonical baseline |
| `survey_templates.sql` | `825d58442d069e26cf72ed14c1d3ac5d701ed06d5c45c280f597b299c17386f3` | unknown | Represented by canonical baseline |
| `surveys_program_link.sql` | `51b755d4aae5edca83461787415f4d9654aed51f673b4f053ed77f4d5c2c9363` | unknown | Represented by canonical baseline |
| `surveys_rls_expansion.sql` | `026276e12a8e01a8928d45ff4797b52b3dd34374e92a20a01f4691cd09b480ad` | unknown | Represented by canonical baseline |
| `surveys_timestamps.sql` | `1a042706a3534ccf0a53acaf845f7bbaf4fb72adf1cffdf97a22daea1ebecff1` | unknown | Represented by canonical baseline |
| `user_notification_prefs.sql` | `7e01b7f98606d05f6a57d7bd8be93bbd8b58e037a7d1398abf54238a73f3be54` | unknown | Represented by canonical baseline |
| `user_permissions.sql` | `2ff699c4fc000df28d90590f25522c6fefcbca75cbcdf56c4c55bacbb98d0f54` | unknown | Represented by canonical baseline |
| `volunteer_class_schedules.sql` | `40f31960fb5cde14cfc667a6ea4735853c888c1430b2e1223d45533bfcb484fb` | unknown | Represented by canonical baseline |
