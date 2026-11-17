# 所有者用：既存jigwiki-adminだけを更新する

このPRではデプロイ・Secrets/vars変更・PRマージを実行しない。Schema v2・既存データ形式・DOのmigration tag v1は変更しない。公開サイトのデプロイや既存配信Workerの作業は不要。

## 先に記録すること（読み取り専用）

1. PRのCIと差分をレビューし、デプロイするコミットを固定する。
2. 既存Cloudflareアカウントで認証済みの端末を使う。`wrangler whoami --json`で既存アカウントを確認し、**新しいアカウントを作らない**。
3. `wrangler deployments list --name jigwiki-admin --json`から稼働Versionと100%トラフィックを確認。`wrangler versions view <稼働Version> --name jigwiki-admin --json`でvars/bindings/runtimeをローカルに記録する。Secretsの値を出力・転記しない。
4. 記録したVersionを切戻し先にする。過去のチャットのVersionを現在の稼働版だと推測しない。
5. 既存ADMIN binding / Admin class / namespace ID / migration tag、workers.dev、GITHUB_CLIENT_ID、ADMIN_USER_IDS、ADMIN_ENABLED、GITHUB_CLIENT_SECRETとSESSION_KEYの登録名を確認。DOを作り直さない。

## ビルド・事前確認

- rootとadminでlockfileどおりnpm ci。root/Adminの全check/test/build/browserとAdmin workerdを確認する。
- `admin`で`npm run build`。共有goods-core.jsも自動コピーされる。CIの`npm run check`はdry-runだけである。
- **本番にリポジトリのwrangler.jsoncをそのまま使わない。** 初期導入向けvarsのfalse/空欄で本番を上書きしない。
- 別の作業用configを作り、varsを丸ごと除去し、keep_vars=true、既存account_id、既存のbindings/runtime/assets設定を明示する。`wrangler deploy --dry-run --keep-vars --config <作業用config>`で確認する。Secretsファイルや--varを追加しない。
- 作業用configはコミットしない。既存稼働版と設定が一致することを確認できない場合は停止する。

## 反映（別途、所有者の明示的承認後のみ）

承認した端末・固定コミット・確認済みconfigに限り、`wrangler deploy --keep-vars --config <確認済みconfig>`を実行する。デプロイ直前に現在の稼働Versionが記録した切戻し先と同じか再確認し、途中で変わっていたら停止する。他Worker・Secrets・vars・DO・ドメインを変更しない。

反映後は新Version、100%トラフィック、vars/Secret登録名/ADMIN namespaceの一致を確認する。GitHubログイン、VTuber編集・既存PR経路、4分野の一覧・既存値、変更プレビューまで確認する。本番のテスト用データPRは所有者が明示的に承認した場合だけ作成し、不要なら閉じる。本番で架空のマスターをマージしない。

この変更の適用にデータ移行は不要。古いAdminでも同じSchema v2マスターを読める。public release.jsonを更新する必要はなく、公開サイトの更新処理を動かさない。

## 切戻し

- 不具合時は新しい一括作業を停止し、直前に記録したVersionへ`wrangler rollback <記録したVersion> --name jigwiki-admin --config <確認済みconfig>`で戻す。実行には所有者の承認が必要。
- DO namespace/SQL/session/journalを削除しない。SESSION_KEYやGitHub Secretを変更しない。既存のPRやmainを自動で戻さない。
- 新しい一括previewはsourceFreeProtocol=2のため、従来WorkerのsourceFreeProtocol=1専用ガードが書込を拒否する。完了済み操作の同じIDの再送は既存の結果を返すだけで、重複PRを作らない。
- 途中で通信不明になった操作は、元のpreview ID・管理branch・GitHub PRを確認する。旧Workerへ戻して新しいバッチの送信を強行しない。新Workerへ戻した後、既存journalから復旧するか、最新mainで再プレビューする。
- 侵害等の緊急事態でAPI停止が必要な場合だけ、所有者が既存の停止手順を判断する。通常の切戻しでvarsをテンプレートへ置換しない。
