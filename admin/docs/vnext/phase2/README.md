# Admin vNext Phase 2

[設計](DESIGN.md) / [API・状態・Phase 3への境界](API.md) / [導入・切戻し](DEPLOY.md)

## 実装範囲

保存された人物・組織・グループ・記念日・音楽・歌枠・イベント・グッズを選び、1本のPRへ提出する。全件/個別/カテゴリ/関連変更の選択、比較、依存関係、最新main検証、確認hash、部分提出、提出済みPR/CI/失敗ジョブを扱う。理由は全経路で任意。公開master/Schema v2/ID/配信収集/公開Version 2.13.0/Cloudflare設定は変更しない。

新しい提出方式は既存publish gatewayを使う。既存のフォームからのsave/batchプレビューも保存済みworkspaceの同じ提出エンジンへ接続。変更していない親Campaignは提出変更として数えず、Product/Offerの2件を検証する。削除/統合/収集対象等の既存特殊操作は旧確認UIを保持し、監査方式と理由任意化を共通化した。

## 安全性

- Base/Ours/Theirsのfield単位比較。Base recordはGitHubの元commitと照合。配列の要素対応や名前からのIDを推測しない。
- 別field・別record・同一の最終値は統合し、異なる値/削除/意味的な矛盾は拒否。全masterと参照・公開制御を再検証する。
- 最新registryから新IDを発行し一時参照を解決する。固定済みID、過去の所属・出演枠、既存商品URL等は保持。
- PRが確認できるまで成功扱いにしない。決定的branchと暗号化journalで再試行。別タブで変わった操作はhash不一致として保持する。
- PR更新はownerの既知head/同一repo/main向けopen PRだけ。確認後にmain/headを再検査し、non-forceのfast-forwardで変更する。未知のcommitや手動branch変更を置換しない。
- auditはbatchごとの新規file。過去ledgerは保持。サーバー/CIで検証し、既存auditの変更・削除をCIで拒否。出典管理は追加しない。
- OAuth・CSRF・allowlist・repo権限、DO/class/binding/Secrets、保存protocol 1は維持。提出protocol 2、新legacy planのprotocol 3で切戻しを区別する。

## 画面比較と操作

同じ20件（VTuber5・記念日5・Campaign10）の保存済み下書き、模擬GitHub、同じviewportで実ブラウザー撮影。テスト用の編集名だけを使用し本番masterへは書かない。

| 対象 | Before | After |
| --- | --- | --- |
| 変更一覧1440 | [Phase 1](screens/before-selection-1440.png) | [選択/比較](screens/selection-1440.png) |
| 変更一覧390 | [Phase 1](screens/before-selection-390.png) | [選択/比較](screens/selection-390.png) |
| レビュー | 単件/既存content batch | [1440](screens/review-1440.png) / [390](screens/review-390.png) |
| 提出済みPR/CI | 専用画面なし | [1440](screens/submitted-1440.png) / [390](screens/submitted-390.png) |
| 同一field競合 | main変更で再入力 | [Base/Ours/Theirs](screens/conflict-1440.png) |

操作数は保存済みの「変更内容」から、文字入力とスクロールを除いて測定。

- 全20件: プレビュー→確認checkbox→作成の**3操作、1PR**。
- VTuber5件だけ: 選択解除→VTuberを選択→プレビュー→確認→作成の**5操作**。残り15件を保持。
- 任意の5件: 選択解除＋5checkbox＋プレビュー/確認/作成の**9操作**。
- Phase 1では同じ人物5件は個別PR、残り15件は既存content batchであり、少なくとも6PRと理由入力を要した。人物とcontentを1PRにする選択画面はなかった。
- field衝突は採用値を選択→下書き保存→再プレビュー。非衝突の下書きは再入力しない。

1440/1920の全幅AppShellやinline編集はPhase 3の範囲。今回それらを実装済みとはしない。モバイルは表領域だけの横スクロールで操作列を保持。確認前の主操作はdisabled、送信中はUndo/Redoや戻るを含め二重操作を止める。操作対象は44px以上、focusとlabelを維持。長いSHA/URL/競合値は折り返す。画面比較を目視し、旧CSSによる操作列非表示、保存復旧後の古いエラー、通信失敗後の古いマージ可能表示が残らないことを確認した。

## テストとCI再発防止

- root check / test **195件** / build / 全7ブラウザースイート。
- Admin単体テスト **65件** と既存チェックに、20件一括/5件部分/理由なし/失敗復旧/別タブ保持/owner/CSRF/protocol/確認hash/3-way/ID衝突/依存/意味/監査/PR更新/CI失敗・権限・cache等を追加。
- 実workerd/SQLiteで20件保存→1模擬PR→再送→0件残りを確認。既存の単件/compound/冪等復旧も維持。
- 既存4幅のVTuber、10内容×4幅、workspaceの5幅、Phase 2提出/部分提出/403再試行/CI取得失敗/確認付きmain更新の5幅と競合解決をE2E。320/390/768/1440/1920、light/dark、Space選択、横overflowなし。
- 正規の生成結果（人物名変更、公開記念日・イベント・Campaign/Product/Offer追加、未確定draft Song追加）を一時コピーへ適用し、root checkと**全195単体テスト**を再実行。過去review hashは変更していない。CIの入れ子実行でも実際に全テストが走るよう子processのNODE_TEST_CONTEXTを除外して検証する。
- 過去の候補/登録/楽曲レビューの検証は固定fixtureへ移し、保存済みreviewを変更後のmasterへ再適用すると拒否することも保持。現在の全master検証やID/参照/URL/非公開保護を緩めない。browserの可変件数/価格は現在の公開JSONから検証する。

全テストでGitHubへの書込はmock。本番Cloudflare・既存#42の変更・本番データの追加はしていない。実CIリンクと最終件数はPRに記載する。

## 制限・運用

1. 配列は原子的に比較し、同じ配列の別要素を安全と推測して自動統合しない。競合選択後、通常フォームでも編集できる。
2. 4種類を超えるBase commitやGitHub呼出45回を超える場合、選択を分ける。暗号化plan約1.4MBを超える提出も分割する。保存120操作/512KiBは不変。
3. 新しい提出詳細は180日、owner索引は直近100件を20件ずつ。GitHubの直近50件のAdmin PRも読み取り表示。永続の監査とPRはGitHubに残る。旧PRは安全な再適用用batchがないため読み取り専用。
4. GitHubの必須設定が読めない、CIが未取得/途中/失敗、rulesetが未対応ならマージ可能にしない。Checks/Status読取権限の追加が必要かは所有者が確認する。自動mergeはない。
5. すべての可変データtestの全面的な整理、AppShell/DataTable/大量inline編集はPhase 3/4。今回の提出経路を成立させる範囲の固定値・過去review依存だけを整理した。
