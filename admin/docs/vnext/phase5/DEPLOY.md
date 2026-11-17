# 所有者向け導入・rollback（本PRでは実施しない）

## 互換性

Schema v2の任意項目を2つ追加：talent.historyNamePublic boolean（trueはdraftのみ）、group.formerTalentIds（重複なしの既存talent ID配列）。既存データ・ID・台帳・監査・暗号化workspace-v1/submission-v2は変更しない。過去PRも新validatorで検証可能。配信収集元JSON/Workerや対象リストを変更しない。

通常一覧/目的別UIはAdminのみ。公開投影・配信フィルター・リンク表示を変更するため公開リリースは2.14.0。名前を残す人物は公開JSON上でプロフィール原本ではなく最小の履歴人物投影になる。非表示プロフィールのURLは生成せず、履歴の人物名はテキストで表示する。生の収集JSONはGit上に保持するがPagesへはフィルター後の配信を出す。

## 安全な導入順序

1. 所有者が現在activeのWorker Version/traffic、実varsとSecrets登録名、既存DO binding/class/namespace/instance、migration、workers.dev/assetsを読み取り記録する。実値をGitHub/チャット/公開Artifactへ保存しない。
2. [Phase4の設定維持手順](../phase4/DEPLOY.md)とoffline verify-production.cjsを使用。本番を開発用wrangler.jsoncのfalse/空値で上書きしない。SESSION_KEY、ADMIN_ENABLED、GITHUB_CLIENT_ID、ADMIN_USER_IDS、既存Secrets/DO identityを維持。
3. このPRを人間がレビューしてmainへマージし、新Schemaと公開投影を先に用意する。このPRは実マスターへ新任意項目を書き込まないため、従来のAdminも既存データを読み取り・編集できる。
4. 所有者の別途明示承認後、新Schemaに対応するAdminをbuild/dry-runと設定維持確認を経て導入する。新UIのデータPRは公開側の対応がmain/Pagesへ反映してからマージする。
5. 新方針の試験PRを人間がレビューし、生成HTML/公開JSON/既存関連リンクを確認してからマージする。原本の履歴は削除しない。

本PRの開発・CIでは本番Workerへ接続/デプロイせず、実設定を確認済みとは表記しない。

## rollback

- 新任意項目がマスターに未導入なら、記録済みの直前Worker Versionへ所有者がrollbackできる。DO/暗号/保存形式を変えていないため既存下書きと提出履歴は維持。
- **新任意項目を含むデータが導入済みなら、旧Phase4の静的validatorへそのまま戻してはいけない。** 新Schemaに対応したWorker Versionへ戻すか、同じ新validatorを保持した修正版を用意する。データ/監査を自動revertせず、掲載方針を再レビューする。
- 公開側を旧コードへ戻す場合も、新policyデータの存在と公開参照を確認。旧コードは公開参照つきdraftを拒否するためbuildが停止し得る。停止を検証削除で回避しない。
- SESSION_KEY変更、DO削除/namespace再作成、mainの強制更新は行わない。所有者承認前の本番操作は行わない。
