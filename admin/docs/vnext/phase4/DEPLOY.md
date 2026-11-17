# 所有者向け導入・切戻し（本PRでは実行しない）

本番Cloudflareに未接続。下記は所有者の承認後に、既存アカウント/既存jigwiki-adminだけを対象に実施する。アカウント/独自domain/Appを新設しない。stream-videos-apiは対象外。

## 読取り専用の事前記録

- Wranglerログイン済み端末で `npx wrangler@4.100.0 whoami`、`deployments list --name jigwiki-admin` で現在100%配信中のVersion IDを控える。単なるversions listの先頭をactiveと決めつけない。
- `versions view <active-version-id> --name jigwiki-admin --json` からruntime、bindings、plain varsをローカルの **admin/.production.version.json** に保存。実値/ファイルをGitHub・チャット・CI artifactへ貼らない。Secretは値でなく登録名のみ確認する。
- DashboardのWorker URL設定、DO namespace/instance（既存jigwiki-admin-v1）、account IDを読み取り、`.production.settings.json`へローカル保存。形式は `accountId / adminNamespaceId / workers_dev / preview_urls`。実値をこの文書へ埋め込まない。
- 切戻し先Version ID、main SHA、build SHA、設定の一致確認を所有者の安全な運用記録に残す。GitHub上には実vars・Secretを記録しない。

## 保持する設定

ADMIN_ENABLED / GITHUB_CLIENT_ID / ADMIN_USER_IDS の実値、GITHUB_CLIENT_SECRET / SESSION_KEY の登録名と既存値、ADMINのclass/name/namespace/instance、migration v1、compatibility date/flags、workers.devとpreview設定、ASSETS/run_worker_firstを保持。

`admin/wrangler.jsonc`は**開発用**であり、varsのfalse/空文字を本番へ適用しない。`--keep-vars`だけ付けても、configや`--var`に明記した値は上書きされるため十分ではない。

## ローカルでの準備とdry-run

1. 最新mainでroot/Adminのチェックを完了。
2. **admin/.production.config.json** を既存本番metadataと照合して作成する。configとpublic/buildの相対パスが合うようadmin直下に置く。新規var/route/migrationを追加しない。keep_vars=true、既存のplain varsすべてを同じ値で記載、Secretの実値は記載しない。account_idも読み取り確認した既存アカウントと一致させる。
3. `cd admin` の上で `node scripts/verify-production.cjs .production.config.json .production.version.json .production.settings.json`。offline比較だけで、接続/デプロイ/設定変更はしない。未知のbinding/設定やnamespace・vars不一致は停止。Secret/varsの値をエラーへ表示しない。
4. `npm run build`、`WRANGLER_SEND_METRICS=false npx wrangler@4.100.0 deploy --dry-run --config .production.config.json --keep-vars`。dry-run出力も実varsを含み得るため公開ログへ保存しない。
5. active Versionと設定が準備時点から変わっていないか再度読み取り確認。変更があれば再比較する。所有者が競合するデプロイ/設定変更を止める。
6. 所有者の**別途の明示承認**後に同じconfig/keep-varsでcodeとassetsを一緒に導入する。本開発では実行しない。通常の `npm run check` は開発用configのdry-runであり、本番設定維持の確認の代替ではない。

## 導入後（所有者）

新Version IDとactive traffic、設定/Secrets登録名/DO identityを再確認。実管理者で下書き→保存→再読込→preview、部分提出、CI取得を確認。試験PRを人間がレビューし、自動マージしない。本番varsのコピーやセッション/Workspace復号値をログへ出さない。

## 切戻し

承認された端末で `npx wrangler@4.100.0 rollback <prior-active-version-id> --name jigwiki-admin` を使用するかDashboardで記録Versionへ戻す。rollbackは本番変更なので所有者の判断で実施。active traffic/設定/DOを再確認し、管理画面を再読込。master JSONや監査ファイルを自動revertしない。DO削除・migration追加・namespace再作成はしない。

Phase 4はバックエンドprotocol/暗号形式を変えない。Phase 1のworkspace-v1（30日、120操作/512KiB）、Phase 2のsubmission-v2/append-only audit v2を保持。Phase 3/Phase 2へ戻しても保存済み状態は同じ形式。切戻す古いWorkerで未対応機能を使わず、Phase 1以前のWorkerへ戻す場合は提出機能の互換性を別途確認する。Secret SESSION_KEYを変えると既存session/Workspace/履歴を復号できなくなるため、本導入と鍵ローテーションを混ぜない。

確認資料（2026-11-17）: [Wrangler config/keep_vars](https://developers.cloudflare.com/workers/wrangler/configuration/)、[versions](https://developers.cloudflare.com/workers/wrangler/commands/#versions)、[rollback](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/)。pinned 4.100.0のdeploy --helpでdry-run / keep-varsを確認。最新releaseへの無条件更新はせず、実運用端末の対応を所有者が確認する。
