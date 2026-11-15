# jigwiki Admin 初回設定（所有者がレビュー後に実施）

## 既存環境の調査・比較

既存のCloudflareアカウントを利用する。新しいアカウント・独自ドメイン・課金契約は不要。
`stream-videos-restapi` mainには `ops/classifier/wrangler.jsonc`（wiki-video-classifier、Cloudflare Access、SQLite DO CLASSIFIER）、`ops/scheduler`（Cron、SQLite DO）がある。classifierのHTTP APIは分類専用であり、GitHubログイン・PR権限を持たない。デプロイは所有者のwrangler手動運用で、GitHub Actionsは同期/テストを実行する。classifierのvarsに公開Access issuer/audience、Secretsに別途同期用Tokenを使用する構成。これらの値・Secret・DOをadminへコピーしない。

`stream-videos-api`という本番Workerのコード/設定は確認できず、所有者も保存場所未把握と回答。**既存Workerには一切変更しない**。アカウントの残枠、実デプロイ済みサービス、既存GitHub Appの一覧は現在の接続権限では確認不能（GitHub installation API401、repository settings API403）。Workerの存在・残枠・本番設定を推測しない。

|案|設定・運用|権限隔離|判断|
|---|---|---|---|
|同一アカウントにjigwiki-admin独立Worker|既存wranglerログイン/CI認証方式を再利用可能、Worker名とSecretsだけ別|配信APIとGitHub権限・Cookie・DOを完全分離|採用|
|既存Workerに/admin統合|ルート/認証/Secrets/デプロイ/障害範囲が混在。コードも未確認|公開APIにGitHub書込資格情報が同居|不採用|

## 所有者が設定する最小項目

1. 既存CloudflareアカウントのWorkers FreeとSQLite Durable Objects Freeの**共有残枠**を確認。既存運用のwrangler認証を使う。新しいアカウントを作らない。
2. 既存GitHub Appの利用可否を所有者が確認。jigjpwiki.github.ioだけにinstallでき、Web OAuth callbackの追加・変更が既存利用を壊さず、Contents write / Pull requests write / Metadata readだけで足りるなら再利用できる。既存のCloudflare GitHubビルド連携、Accessログイン、schedulerのTokenは、この権限/ユーザー認証の代替ではない。条件を満たすAppがなければ所有者が専用Appを作る。長期PAT・App private key・installation tokenを手動で追加する設計にはしない。GitHub App user access tokenで実際のユーザーとrepo権限を毎回検証する。
3. workers.devの `https://jigwiki-admin.<既存サブドメイン>.workers.dev/auth/callback` をApp callbackに設定する。必要ならApp側にローカル開発callbackを追加（本番callbackを壊さない）。ユーザーauthorization expiring tokensを有効にする。refresh tokenは使わず30分で再ログイン。
4. vars: `GITHUB_CLIENT_ID`、数値GitHub user IDのカンマ区切り `ADMIN_USER_IDS`（1人から開始）、`ADMIN_ENABLED=false`。GitHubログイン名をIDの代用にしない。
5. **jigwiki-adminにだけ** Workers Secrets `GITHUB_CLIENT_SECRET` と `SESSION_KEY`（32 random bytesのbase64url）を登録する。同期用/Wiki/YouTube/既存Worker Secretsはコピーしない。
6. ローカル検証後、所有者が承認した時だけ `npm run build` → `npx wrangler deploy --config wrangler.jsonc` をadminディレクトリで実行。Cron、独自domain、Accessの新規アプリ設定は不要。SQLite DOは同じWorkerの専用binding/migrationで作成。
7. `ADMIN_ENABLED=true`へ切替後、allowlist本人でログイン→一覧→編集→preview→**テスト用データPRを明示的に作成**→GitHub上で差分/CI確認→必要なければ閉じる。別アカウント拒否・logout・Cookie・CSRFも確認。管理画面にはマージ機能がない。

この開発ではApp作成/インストール、Cloudflareデプロイ、Secrets、アカウント、課金、既存Worker、Wiki、本番設定を変更していない。

## ローカル・CI

`cd admin && npm ci && npm test && npm run check`。checkはbuildとwrangler **dry-run**のみ。`npm run dev`はhttps://localhost:8787のローカルWorkerを起動する（Secure CookieとHTTPS強制のためHTTPS。ローカル証明書は開発端末で確認する）。ローカルで実OAuthを使う場合だけ、このURLの/auth/callbackをAppに追加する。`.dev.vars.example`を`.dev.vars`へ複製し、値をローカルのみ設定。開発環境も認証を省略しない。秘密値のない自動テストではfetch/storageをモックし、実GitHubへの書込を行わない。

## セキュリティと費用

Workers静的アセットだけ公開。API/AuthはWorker優先で専用DOへ転送、no-store、トークンはAES-GCMで暗号化してDOに保存、Cookieは不透明なランダムID/HttpOnly/Secure/SameSite=Lax。state+S256 PKCEは5分・一度限り・Cookie/発行originに結び付ける。セッション30分、logoutでserver側も削除。allowlistとGitHub push権限はサーバーで検証し、ローカルStorageへTokenを保存しない。Origin+CSRF Token、CSP、入力上限、固定repo/main base/管理用branch namespace、固定masterパスだけを許可する。ユーザー入力のシェル実行・任意workflow起動・main書込・自動マージは実装しない。

公式資料: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)、[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)、[DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)、[static assets](https://developers.cloudflare.com/workers/static-assets/)。確認時Workers Freeは100,000 requests/day、Worker CPU10ms、SQLite DOは無料枠あり（要求/行read-write/storageはアカウント共有）。計算/保存/外部I/Oは専用DOで行い、フロントWorkerは転送のみ。Freeの上限を超えても勝手にpaidへ切り替えない。静的bundleのサイズとローカルworkerd実行はCI確認し、**アカウント残枠・本番CPU実測は所有者の導入確認項目**。データはGitHub正本、DOは短期session/preview/再開journalのみ。手動操作を1分30APIまで、1リクエスト45GitHub要求以下に制限する。Appのrepo/user API rate limitにも従い403/429で停止、無条件再試行しない。

## ロールバック

`ADMIN_ENABLED=false`で全管理APIを停止。漏えい時はGitHub App token/Secretをrevoke・SESSION_KEYをローテーションし既存sessionを失効、Worker旧versionへ戻す。既存配信Worker・Pagesの設定は触らない。すでに作ったデータPRはGitHubで閉じる/レビューする。公開masterを自動で戻さない。DOの削除migrationを実行しない。第7B/Cの候補・音楽・イベントレビュー/監視メニューは未実装で公開しない。

A1は認証・固定GitHub連携・安全なPR送信の基盤です。編集用plan engineはA2で追加するため、A1だけでは変更previewは拒否し、データ編集を有効化しません。A1のUIに未実装メニューは表示しません。公開Pagesのバージョン2.9.0は変更しません（非公開管理アプリの導入を公開済み機能として宣伝しないため）。

OAuth公式根拠（取得200/PKCE記載確認）: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app 。この接続ではCloudflare dashboardを操作していないため、既存アカウントID・本番worker.dev名・残枠・既存Appの再利用可否の最終確認は所有者が行う。

A1検証: 管理基盤6テスト、既存168テスト、check/build/browser成功。wrangler deploy --dry-run成功（新Worker専用ADMIN/ASSETS bindingのみ）。実GitHub書込はモックで検証し、App作成やCloudflareへデプロイはしていない。
