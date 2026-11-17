# Admin vNext 5

元の状態管理再設計、共通UI品質、全カテゴリ一覧再設計の3要件を統合。開始main `366cb245c`（Phase4 #46マージ済み）。本番データ/Secrets/Cloudflareの操作なし。

## 実装

- VTuberの通常一覧は画像を名前の左へ配置し、事務所順/登録順で一人一回表示。複数現在所属の代表は事務所マスターで最初の組織。他所属は表示を維持。旧所属のみ/無所属/不明を分離。97名を全件表示し、通常一覧にページ番号/横スクロールなし。
- 名前/別名/固定ID検索、事務所・グループ・状態・公開状態による条件、名前順/登録順。詳細から戻っても検索/条件/スクロールを維持。200件超のみ連続追加、検索は常に全件。
- 記念日・音楽・イベント・グッズも通常検索一覧と一括編集を分離。関連人物/種類で検索・選択。複雑なCampaign/Product/Offer、Slot、Performanceは既存階層編集を維持。
- 通常の状態変更は目的別。活動開始/休止/再開/引退/終了、所属/退所/移籍、グループ加入/脱退、掲載開始/停止。複数選択を1つのWorkspace操作単位として記録。全体生成失敗時は0件適用。Undo/Redoも共通Workspace。
- 活動・所属・掲載の独立性を維持。退所は選んだ事務所だけformerへ変更し活動/公開は不変。移籍は旧履歴を残す。日付は不明null。グループ旧名簿はformerTalentIdsへ保持。
- 公開停止の方針を事前選択。公開履歴の名前・リンクを残す方針では、関連コンテンツを消さずプロフィールを閉じる。完全にサイト非表示の方針では公開参照の依存閉包をdraft化し全履歴・ID・価格を原本へ保持。単純な検証削除ではない。
- 未リンク文章に非公開名/アカウントが含まれる可能性は自動同一視/匿名化せず保留。対象名と修正案を示し、履歴の公開方針か個別修正を人間が選ぶ。全master/PR直前/main SHA/hash/CSRF/権限等の確定検証を維持。
- tokens.cssに色/余白/文字/テーマを一元化し、旧app/workbenchの重複root定義を撤去。Stack/Inline/ButtonGroup/PageSectionを共通化。成功画面の主操作は「GitHubでPRを開く」。モバイルは横送りメニューを折返し、一覧の詳細条件を展開式にした。

[設計・状態遷移](DESIGN.md) / [検証・比較](VALIDATION.md) / [導入・rollback](DEPLOY.md) / [UI測定JSON](ui-report.json) / [Before測定JSON](before-ui-report.json)

## 比較画像（同じviewport）

| 対象 | Before | After |
| --- | --- | --- |
| VTuber 1440 | [画像](screens/before-VTuber-1440-light.png) | [画像](screens/VTuber-1440-light.png) |
| VTuber 390 | [画像](screens/before-VTuber-390-light.png) | [画像](screens/VTuber-390-light.png) |
| 記念日 1440 | [画像](screens/before-記念日-1440-light.png) | [画像](screens/記念日-1440-light.png) |
| グッズ 390 | [画像](screens/before-グッズ-390-light.png) | [画像](screens/グッズ-390-light.png) |

[公開影響](screens/公開影響-1440-light.png) / [参照エラー](screens/参照エラー-390-dark.png) / [保存失敗](screens/保存エラー-390-dark.png) / [競合](screens/競合-1440-light.png) / [PR完了](screens/PR完了-390-dark.png)。全画面/各幅/両テーマはscreens下。

## 運用上の意味

「公開履歴に名前を残す」は完全非公開ではない。公開される人物投影はid/displayName/profileHiddenのみで、プロフィールやSNS欄を公開しないが、過去コンテンツの表示名・配信リンクは残す。

「関連情報も非公開」は公開サイトの表示制御。公開GitHubリポジトリのマスター/履歴、外部サイトや既存キャッシュを秘密化/削除する機能ではない。プライバシー削除依頼は別の人間の手続きを必要とする。自由文の誤一致もあり得るため、保留候補を実人物と自動断定しない。

保存は下書きであり公開ではない。PR作成後は人間が差分/CIを確認しマージする。既存の部分提出では、公開停止の依存変更を切り離すと確定検証で拒否される。120操作/512KiBを超える影響は自動分割せず止める。名前を履歴に残すか、個別の掲載計画をレビューする。
