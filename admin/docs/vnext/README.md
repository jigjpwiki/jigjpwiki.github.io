> Phase 3: [高密度編集UI・実測・導入](phase3/README.md)

# Admin vNext / Phase 1: 保存ワークスペース

後続の[Phase 2（選択一括PR・監査・再適用・提出管理）](phase2/README.md)を追加しました。以下はPhase 1時点の記録です。

[全体計画](PLAN.md) / [DADS調査・コンポーネント方針](DESIGN-SYSTEM.md)

## 今回使える操作

- 既存のVTuber・事務所・グループ・記念日・音楽・イベント・グッズ編集を継続。
- 入力をカテゴリ横断の「変更内容」に保持。5秒間入力が止まると自動保存。「下書きを保存」で明示保存。
- 保存済み/未保存/保存中/保存失敗/別タブ競合を表示。未保存離脱は警告、logoutは保存完了を待つ。
- 再読み込み・再ログイン後に再開。既存値・他レコードを変更せず、before/valueを別に保持する。
- 30段階のUndo/Redo（現在のブラウザー内のみ・操作後は一覧に戻る）。個別除外、既存フォームで編集再開。
- 保存失敗では入力保持。別タブ409は黙ってretry上書きしない。「変更内容」で保存済み版の再読み込みを選べる。破棄前に確認する。

下書きは**未検証**で、保存から30日間、120操作/512KiB上限。暗号化・所有者分離、非公開DOのみ。全masterをDOへ複製しない。秘密キー類のフィールド・未知メタデータ・固定ID変更を拒否。URLや必須項目の未完成値も下書き保存はできるが、既存PR検証は緩和していない。

## 今回まだ行わないこと

- 保存ワークスペースの異種カテゴリ選択→1本のPRはPhase 2。従来の単件/カテゴリbatch PRは引き続き利用可能。
- 安全な3-way再適用はPhase 2。それまでは保存後のmain SHA変更を検出した下書きの提出を止め、古い値で置換しない。
- append-only audit、自動PR本文、任意理由、提出済みPR/CI管理もPhase 2。既存ledger/理由/preview/journalは維持。
- 全幅sidebar/DataTable/inline/bulk/列選択などの業務UIはPhase 3。今回の保存バーをUI全面刷新完了とは扱わない。
- 現行可変masterテスト・保存済みreview hashの整理、全カテゴリ最終評価はPhase 4。#42の競合やCIは別案件。

前段階のマージ後に最新mainで次の独立PRを作る。依存branchにマージして完成扱いにしない。

## Before / After

実際のブラウザー、模擬GitHub、同じマスターで撮影。外部画像を転載していない。

| 対象 | Before | After |
| --- | --- | --- |
| 記念日編集1440 | [画面](screens/before/anniversary-edit-form-1440.png) | [画面](screens/after/workspace-editor-1440.png) |
| 記念日編集390 | [画面](screens/before/anniversary-edit-form-390.png) | [画面](screens/after/workspace-editor-390.png) |
| グッズ一覧1440 | [画面](screens/before/goods-list-1440.png) | 一覧UIは本PRで変更しない |
| 変更内容 | カテゴリ内のメモリ保留のみ | [1440](screens/after/workspace-changes-1440.png) / [390](screens/after/workspace-changes-390.png) |
| 20件の保存済み下書き | 再読み込みで消失 | [1440](screens/after/workspace-20-1440.png) / [1920](screens/after/workspace-20-1920.png) / [390](screens/after/workspace-20-390.png) |

## 操作と画面の評価

同条件: ログイン・一覧表示済み、記念日のタイトル編集、入力そのものを除く。

| 操作 | Before | Phase 1 |
| --- | --- | --- |
| 1件編集して一覧へ | 開く＋保留=2クリック | 同じ2クリック、背景保存。保存を急ぐなら追加1クリック |
| 10件編集して一覧へ | 開く＋保留×10=20クリック | 同じ20クリック、最後の明示保存を含めると21。inlineによる削減は未実装 |
| 画面遷移 | 一覧↔編集10往復 | 同じ10往復。Phase 3で削減する |
| 再読み込み後の再開 | 再入力が必要 | 変更内容→編集再開の2クリック |
| 保存失敗からの復旧 | 永続保存なし | 入力を保持し保存ボタン1クリックで再試行 |
| 別カテゴリ移動 | 保留を破棄 | 保存済み下書きを保持 |

[実測JSON](screens/after/measurements.json): 高さ900px、20件表示。1440/1920ともmain幅1120px・行高67px・スクロールなしで5行。幅利用率は77.8%/58.3%で**業務UIの最終目標には未達**。Phase 3で208px sidebarと残り全幅に変更し、同条件で比較する。390pxはmain390px・行高57px・3行。操作列は隠さず、表領域内だけ横スクロール。320/390/768/1440/1920ともdocumentの意図しない横スクロールなし。

画面を目視し、保存復旧後の古いエラー表示が残らないよう修正。モバイルで既存CSSが表の最終操作列を隠す問題を専用の表スタイルで修正。全幅・フォーム密度・ボタン主従の最終評価はPhase 3/4で行い、保存だけで編集クリックが減ったとは報告しない。

## 検証

- root check / test **195件** / build / 全7ブラウザースイート。
- Admin **45件**、check（dry-run）、実workerd/SQLite。異なるカテゴリ20件の保存・暗号化・所有者分離・revision・上限・期限・protocol拒否。
- 実SQLiteで同revisionの並行保存→200/409、既存OAuth→preview→模擬PRと冪等復旧も維持。
- 既存Admin 4幅＋コンテンツ10ケース×4幅、保存/復旧/Undo/Redo/再ログイン/同時タブを5幅でE2E。新UIから本番GitHubへは書かない。
- 公開マスター、Schema、収集、公開UI、公開Version 2.13.0、wrangler設定、Secrets、依存に差分なし。private Admin機能のみのため公開サイトで未デプロイ機能を告知しない。
- Workerは約745KiB/gzip78KiB（従来739.78KiB/76.78KiB）。新runtime依存なし。公開Pagesアセット増加なし。スクリーンショットは非公開ビルド対象docsのみ。

## 導入・切戻し

本PRはデプロイしない。所有者の承認後に、[既存手順](../content/DEPLOY.md)で現在の本番version/vars/Secrets名/DO bindingを読み取り確認し、切戻し版を記録する。テンプレートのADMIN_ENABLED=falseや空欄を本番へ送らない。

DO class/instance/binding・SQLite table・migration tag v1は不変。追加はworkspace-v1:<数値owner>キーのみ。旧Workerはこのprefixを使わず、旧session/preview/journalをそのまま利用する。新下書きを旧previewへ変換して自動提出しない。旧Workerへ戻すとワークスペースUIは利用できなくなるが、保存データは期限内保持される。新Workerを再導入すれば復元する。SESSION_KEYは復号に必要なので同時に変更しない。古い稼働versionへの**本番切戻しは未実施**。
