#!/usr/bin/env bash
set -euo pipefail
live=/opt/xingzhou-cloud-backend
stage=/home/ubuntu/xingzhou-2.8.147-stage
backup=/opt/xingzhou-backups/local-projects-2.8.147-$(date -u +%Y%m%dT%H%M%SZ)
test "$(sha256sum "$live/src/collab.cjs" | cut -d' ' -f1)" = 23d3dc5be3f1870f0417217911f0563ec405dd29b030cd6a4d670c99e35b9128
test "$(sha256sum "$live/src/collab-episodes.cjs" | cut -d' ' -f1)" = b3d5ae98e5d933467ee17d8490accd3582ebf3128aa55894a99eff861434bfd9
test "$(sha256sum "$live/src/director-source.cjs" | cut -d' ' -f1)" = 594e4fcf2841aa5cc97cd1fd6997b6099dc73a4f20124c84a1c3a8a2b54adfbc
test "$(sha256sum "$live/src/postgres-repository.cjs" | cut -d' ' -f1)" = 8f46a99f31dc44fcf9f4a41ce8e6fb1c3cd486efde344f837af9692d735af2c8
test ! -e "$live/src/local-project-share.cjs"
for name in collab.cjs collab-episodes.cjs director-source.cjs postgres-repository.cjs local-project-share.cjs; do node --check "$stage/src/$name"; done
node --test "$stage/test/art-composition-v2815.test.cjs" "$stage/test/art-episode-v228.test.cjs" "$stage/test/art-fast-publish-v2843.test.cjs" "$stage/test/art-publication-reference.test.cjs" "$stage/test/art-review-classification.test.cjs" "$stage/test/asset-adoption137.test.cjs" "$stage/test/asset-image-links.test.cjs" "$stage/test/asset-update.test.cjs" "$stage/test/auth.test.cjs" "$stage/test/backend-repair-v228.test.cjs" "$stage/test/cloud-recycle-v2813.test.cjs" "$stage/test/collab-local-source.test.cjs" "$stage/test/conditional-project.test.cjs" "$stage/test/config.test.cjs" "$stage/test/cos.test.cjs" "$stage/test/director-versions.test.cjs" "$stage/test/episode-identity-repair.test.cjs" "$stage/test/generation-references.test.cjs" "$stage/test/image-preview.test.cjs" "$stage/test/invite-email-register.test.cjs" "$stage/test/jsonb-params.test.cjs" "$stage/test/legacy-local-collab-source.test.cjs" "$stage/test/local-project-share147.test.cjs" "$stage/test/media.test.cjs" "$stage/test/migration-manifest.test.cjs" "$stage/test/my-role.test.cjs" "$stage/test/profile-v223.test.cjs" "$stage/test/prompt-editions134.test.cjs" "$stage/test/protected-skills.test.cjs" "$stage/test/recommended-duration146.test.cjs" "$stage/test/reference-management.test.cjs" "$stage/test/reference-upload-delete146.test.cjs" "$stage/test/reference-upload-repository146.test.cjs" "$stage/test/registration-invite-role.test.cjs" "$stage/test/response-compression.test.cjs" "$stage/test/server.test.cjs" "$stage/test/session-security.test.cjs" "$stage/test/software-license-rate-limit.test.cjs" "$stage/test/software-license-service.test.cjs" "$stage/test/software-license.test.cjs" "$stage/test/source-link-v228.test.cjs" "$stage/test/storyboard-publication143.test.cjs" "$stage/test/storyboard-settings144.test.cjs" "$stage/test/storyboard-v220.test.cjs" "$stage/test/storyboard-v222.test.cjs" "$stage/test/supabase-contract.test.cjs" "$stage/test/supabase-parity.test.cjs" "$stage/test/win-ai-classifier.test.cjs" "$stage/test/win-ai-identity.test.cjs" "$stage/test/win-ai-web-auth.test.cjs"
mkdir -p "$backup/src"; chmod 700 "$backup"
for name in collab.cjs collab-episodes.cjs director-source.cjs postgres-repository.cjs; do cp -a "$live/src/$name" "$backup/src/"; done
rollback(){ trap - ERR; cp -a "$backup/src/"* "$live/src/"; rm -f "$live/src/local-project-share.cjs"; systemctl restart xingzhou-cloud-backend; }
trap rollback ERR
for name in collab.cjs collab-episodes.cjs director-source.cjs postgres-repository.cjs local-project-share.cjs; do install -m 644 "$stage/src/$name" "$live/src/$name.147-new"; mv -f "$live/src/$name.147-new" "$live/src/$name"; done
systemctl restart xingzhou-cloud-backend
healthy=false
for attempt in $(seq 1 15); do if curl --fail --silent http://127.0.0.1:4310/healthz >/dev/null; then healthy=true; break; fi; sleep 1; done
test "$healthy" = true
systemctl is-active xingzhou-cloud-backend
sha256sum "$live/src/local-project-share.cjs" "$live/src/collab.cjs"
trap - ERR
echo "DEPLOYED_147 backup=$backup"
