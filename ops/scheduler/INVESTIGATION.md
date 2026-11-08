# 定期実行調査と改善（2026-11-09 JST）

調査取得時刻: 2026-11-08 18:03–18:05 UTC（11月9日03:03–03:05 JST）。本番設定、Secrets、workflow enable/disable、dispatchは変更・実行していない。

## 確認できたこと

- `gh api repos/jigjpwiki/jigjpwiki.github.io`: default branch=`main`、archived=false、disabled=false。
- Actions workflows API: `.github/workflows/update-streams.yml` は `active`。main上のcronは構文上正しく15分間隔、毎時0分を避けている。
- 現行ワークフローは2026-11-08 11:42 UTCのcommit `b4939a232`以降。取得時点の全10件にscheduleなし。手動成功3件、push成功4件・失敗2件、手動cancelled1件。
- 最終手動成功: [42494274707](https://github.com/jigjpwiki/jigjpwiki.github.io/actions/runs/42494274707)、15:20:07–15:21:00 UTC。testは意図的skip、update/deploy成功。
- 旧YouTube定期実行19件の最大間隔8.33時間、旧Twitch19件は8.17時間（リポジトリ最新100件の標本）。新ワークフローに限らない欠落。
- `test`はpush/PRのみ、scheduleでskipが正常。`update`は`always()`、main、test success/skippedを許可する。YouTubeは30分間隔でskip、探索は`auto`で約1時間間隔。これは実行履歴そのものがないことを説明しない。
- concurrency `site-${{ github.ref }}` / cancel=false。1 writerで直列化。手動cancelled1件はあるが、数時間のschedule欠落を裏付けるcancelled/queued実行は取得記録にない。

## 原因と確認できない事項

確認できた障害は「想定頻度に対してscheduleイベントのrun作成記録が疎、または存在しない」こと。手動の処理経路は動いている。default branch不一致、現在のworkflow無効化、ジョブのifだけを原因とする証拠はない。

GitHubスケジューラーの遅延・イベント破棄・登録同期不整合は候補だが、REST APIは予定されたが作成されなかったイベントを公開しない。runのcreated_at以前の待ち時間も分からず、内部原因は断定できない。GitHubはscheduleの遅延・高負荷時の破棄と、public repoの60日非活動時の無効化を文書化しているが、このリポジトリでの発生を証明するものではない。

`actions/permissions`と`actions/variables`は両リポジトリで403（Resource not accessible by integration）。組織/リポジトリのActionsポリシー、変数の実値、過去の有効/無効切替、cron最終編集者のアカウント状態、GitHub内部の登録状態は未確認。Secret値は取得していない。現在activeで直近commit・手動成功もあるため、現在の60日無効化は確認できない。

証拠の取得: repo API、actions/workflows、対象workflow runs（per_page=100、全10件）、repo runs（最新100件）、上記成功runのjobs、main上のYAML、workflow変更コミット。最新100件の標本を全履歴として扱っていない。

## 第1段階（標準機能）

このPRはcronを1分ずらす（同じ15分間隔）ことで、マージ時にスケジュール再登録を試す。GitHubが再同期を保証するAPIではなく、改善はマージ後の観測が必要。`SCHEDULE_DRIVER`未設定または`github`の間は標準scheduleを使う。処理本体とAPI取得頻度を維持する。

マージ後、Actions画面でactive/main/設定/最終cron編集者のアクセスを管理者が確認し、最低24時間、schedule eventのcreated_atと実ジョブ成功を記録する。3周期超の欠落を監視対象にする。なおGitHub cron自体に時刻保証はない。activeなので、調査中のdisable/enableや無目的な手動実行は行わない。なおも欠落する場合のdisable→enableは、停止期間を合意した管理者による一度の再登録試行に限定する。

## 第2段階（外部Cron）

`ops/scheduler/README.md`参照。Cloudflare無料Cron + SQLite Durable ObjectでGitHub workflow_dispatchを呼ぶ。標準cronを残し、変数で片方の実処理のみを選択する。Workerは初期状態ENABLED=false。デプロイ・切替・Secret登録はこのPRの作業範囲外で、実施していない。

参考: [GitHub schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)、[concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)、[Cloudflare Cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/)、[Durable Objects料金](https://developers.cloudflare.com/durable-objects/platform/pricing/)。Cloudflare料金ページは環境から403で直接確認できず、導入前に無料枠とSQLite DO対応を管理画面で確認する。

## 検証結果

- Actions YAML: actionlint v1.7.7でエラーなし。
- Worker単体: 7件成功（GitHub通信はモック）。
- Cloudflare workerd + SQLite Durable ObjectをMiniflareでローカル起動し、5つの同時tickに対してPOSTが1回だけであること、未認証401、成功未観測のhealth503を確認。外部通信はモックで、本番へ接続していない。
- Wrangler 4.76.0のdeploy --dry-runでbundleとbinding/configを検証。
- じぐじゅーる: npm run check、既存31テスト、npm run build成功。UI変更なしのためローカルbrowser回帰は再実行せず、既存PR CIを維持。
- 実際のCloudflare Cron配送、Secret登録、GitHub dispatch、再登録後のschedule復旧と本番API日次クォータは未検証。マージ/デプロイしていないため、このPRだけで復旧を確認したとはしない。
