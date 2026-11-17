# Phase 1からの導入・切戻し

本PRで本番デプロイ・設定変更は行わない。

1. 最新mainのSchema v2、#43の保存動作、CI、ownerの承認を確認する。
2. **現在の**`jigwiki-admin`本番versionを読み取り記録し、切戻し先を確定する。過去のversion番号を現行と推測しない。
3. vars/Secrets名/DO bindingとnamespaceを現行から読み取り確認する。値をログ・GitHub・スクリーンショットへ出さない。既存ADMIN_ENABLED/GITHUB_CLIENT_ID/ADMIN_USER_IDSを維持する。
4. [既存安全手順](../../content/DEPLOY.md)に従い、テンプレートvarsを除いた一時configと`keep-vars`でdry-run・差分確認する。`admin/wrangler.jsonc`のfalse/空欄をそのまま本番へ送らない。
5. ownerの明示承認後に同じWorkerだけをデプロイする。class `Admin`、binding `ADMIN`、instance名、SQLite table、migration tag v1、既存Secrets/varsは変更しない。
6. 保存済みworkspaceを読み、理由なしのpreviewまで確認。実PRは人間が明示的に提出し、CI/差分を確認する。

新DO migration・新binding・新Cloudflare resourceは不要。追加prefixは`submission-preview-v2`/`submission-v2`/`submission-index-v2`/`submission-update-v2`/状態cacheのみ。workspace-v1の形式・期限・revisionは不変。

切戻しは手順2で記録したWorker versionへ戻す。Phase 1 Workerは新prefixを読まず、新protocol 2 APIを処理せず、新legacy planのsourceFreeProtocol 3も送信しない。既存session/DO操作履歴/古いjournalは保持する。保存workspaceは同じprotocol 1のままなので、未提出分はPhase 1で再開できる。新しい提出履歴/進行中journalは期限内に再導入すれば復旧できる。切戻し中に同じ変更を旧経路で重複提出せず、GitHubのPRと既存batchを先に確認する。

SESSION_KEYはAES-GCMの下書き・提出plan・session tokenの復号にも使う。本導入と鍵変更を同時に行わない。鍵ローテーションが必要な場合は別途、旧鍵での復号・新鍵での再暗号化・全件確認・旧session失効を設計する。旧鍵なしで暗号化データを復元できると案内しない。

GitHub上の旧ledgerとOpen PRを保持する。#42をmerge/close/updateしない。旧PRの監査追記競合は自動修正済みとは扱わず、新しい提出方式での再発防止と区別する。本番の切戻し試験はこのPRでは行わず、実ローカルworkerd/SQLiteとprotocol拒否・journal復旧で検証する。
