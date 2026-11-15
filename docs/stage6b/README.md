# 第6段階B — セットリスト解析・照合・登録案と実データ

## 基準と実績

最新main `cbf93562c`から開始。#19/#20はmain統合済み、Version 2.8.0。[43731044568](https://github.com/jigjpwiki/jigjpwiki.github.io/actions/runs/43731044568)のArtifactを取得し、69候補（pending62/needs_review7）をSchema検証して利用した。元Artifact/チェックポイント/キューを上書きしない。404の部分失敗、19チャンネル継続、日次58単位の記録も確認した。

[件数・API・公開容量](results.json)。67動画の公式メタデータを取得（68 ID要求、1 IDが返らず。削除/非公開とは断定しない）。32本の歌枠候補でコメント先頭1ページ（relevance、最大100件）を取得し、189コメントを解析した。投稿者名・ID・アイコン・いいね数・返信は保存/利用しない。

| 公開マスターへの変更 | 新規 | 合計 |
|---|---:|---:|
| 楽曲 | **52**（公式オリジナル2、公式歌枠説明欄の表記50） | 57 |
| 歌動画 | **2**（オリジナル、カバー追加0） | 4 |
| 歌枠 | **15** | 17 |
| 歌唱記録 | **52** | 55 |

既存歌唱記録3件のID・内容は不変（既存レコード自体の補完0）。既存歌枠w7E-oj1HOfcは28曲追加で3→31曲。新規の説明欄付き歌枠は3本、残る新規12本は公式タイトル/所有チャンネルで歌枠の種別を確認したがセットリスト未確認のまま。既存Gtj6VUcjVGMもunreviewedを維持した。

曲・時刻は本人の公式説明欄の番号付きリストを出典として確認した。音声を聴いて全編を検証したという意味ではない。4本の公式リスト計55行を転記し、OP/開始挨拶は除外。既知の全31行を確認したw7は**complete（31/31）**へ更新。他の3本は全体の既知件数を確定せずpartialとする。完全性は公式説明欄のセットリストを基準とし、音声から未記載の歌唱まで検証したという意味ではない。「31曲登録済み」は「配信内の歌唱が漏れなく31曲だった」という保証ではない。

楽曲同一性の確認対象は新規52＋既存3の55 ID。説明欄出典のアーティスト名は`artistEvidence=performer_description`を維持し、作曲者/原歌唱者を独自に訂正しない。`金曜日のおはよう / HoneyWorks feat.Gero`は既存HoneyWorks表記への同一性を確定せず、歌唱記録のsongId=nullで原文を保持した。同名作品へ無理にリンクせず、新規Songの重複作成も避けた。版指定（original ver./movie ver.）は承認データから削除していない。

## コメントから何が増えたか

最終パーサーでセットリスト候補のあるコメントは25件/17動画、曲目候補361行。概要欄に曲目がない**13動画で293行**を発見した。293曲を確認したという意味ではなく、同じ歌唱に対する複数コメントや誤検出/補足も含む。

保守的な同一動画＋曲名＋アーティスト＋互換な曲順のグループ化では、重複根拠78、時刻矛盾グループ32。そのうち公式概要欄とコメントの間の時刻矛盾は3グループ。コメント56行が公式行と同じ曲名/アーティスト/開始時刻に一致する（同じ曲への複数根拠を含む）。一致や上位表示をもって精度を確定しない。全矛盾の完全検出ではなく、artistが不明/異表記なら別候補に残る。

**コメント由来だけで公開した歌唱記録は0件。** 公式で照合できるものは公式説明欄を正本として登録し、コメントだけの時刻は独立した音声/映像の確認を終えていない。候補の発見と歌唱内容の公開承認を分けた。コメントで発見した12本は公式タイトルとチャンネルIDで照合して歌枠アーカイブとして登録したが、コメントの曲目を公開セットリストに移してはいない。

| 実データのケース | 公式動画 | 結果 |
|---|---|---|
| 公式概要欄にセットリスト | [夏渚まはろ・文化祭後夜祭](https://www.youtube.com/watch?v=w7E-oj1HOfc) | 31行を登録、既存から28行増加 |
| 概要欄なし/コメントにあり | [香鳴ハノン](https://www.youtube.com/watch?v=Gtj6VUcjVGM) / [常磐カナメ](https://www.youtube.com/watch?v=fV0_OrZus_Y) | コメントから22行/10行、曲目は未公開。複数根拠を含む |
| 両方にあり | [歌枠リレー](https://www.youtube.com/watch?v=R3PYpVPHF54) | 公式5行とコメント10行、2:54と2:58などの差を保持 |
| 一部のみ確認 | [ぶいのね歌枠リレー](https://www.youtube.com/watch?v=xfLfXL-X9zs) | 公式5行を登録、全編の完全性はpartial |
| コメント取得不能 | [Cw94wqexG54](https://www.youtube.com/watch?v=Cw94wqexG54) / [sFwe-eg_-Zo](https://www.youtube.com/watch?v=sFwe-eg_-Zo) | HTTP403 commentsDisabled、期待される取得不可として後続を継続 |

新規オリジナル：[夢結いレター](https://www.youtube.com/watch?v=nNyroittCT0) / [凸凹デコダイアリー](https://www.youtube.com/watch?v=TV7XXZDZQ0g)。公式タイトルのOriginal Song表記、本人チャンネルID、説明欄のVocal & Wordsを照合。作曲クレジットを原歌唱者と取り違えていない。

## 解析・照合

`lib/setlist.js`の単一パーサーを概要欄/チャプター入力/コメント/既存proposals.chaptersから利用する。00:08:05、08:05 01.、1:02:30、01. 08:05、1曲目、M01、♪、日本語時分秒、全角、by/スラッシュ等を扱う。開始・終了らしい複数時刻は最初の開始候補だけを保持し、終了を推測せず警告。元の行（上限400文字）を失わない。

OP/ED/MC/BGM/開始挨拶/ルール/くしゃみ/時刻表/メドレーなどを歌唱曲と自動確定しない。ヒューリスティックなので見逃し・誤検出はあり得る。曖昧さ、時刻/曲順/アーティスト不明、版指定を警告する。順番・時刻不明はnull。

NFKC/英字大小/空白記号/括弧補足、Song.aliases/readings、明示的な内部artistAliasesで照合候補を提示する。high_confidence_candidate/ambiguous/new_song/insufficientと一致フィールド/理由を記録する。**自動のSong ID代入はしない**。括弧を落とした検索一致が版の同一性を意味しないよう警告を残す。タイトル一致だけでは公開リンクしない。

出典種別は候補側にofficial_description / official_chapter / viewer_comment / manual_review。Data APIは専用のチャプター配列を提供しないため、概要欄の時刻行を勝手に「独立した公式チャプターAPI」として扱わない。official_chapterは確認済みチャプターを明示的に入力する場合の区分。

## 運用CLI（全て公開マスターへの自動書込みなし）

```sh
# ダウンロードしたArtifact内のdiscovery.jsonを渡す。最大10MiB/10,000候補、閉じたSchema検証。
# 取得不可ならGit管理キューを同じ入力に使える。JSとしてrequire/evalしない。
node scripts/analyze-setlists.cjs /tmp/artifact/discovery.json \
  ops/registration/runtime/analysis.json [metadata.json] [comments.json]

# 曲目の承認・原典照合を行ったreview.jsonから、default dry-run。
node scripts/register-music.cjs ops/registration/review.json
node scripts/register-music.cjs ops/registration/review.json ops/registration/runtime/plan.json

# 種別/所有者を確認したレビュー入力だけからコメントを収集。
# 単位上限は1実行/同じPacific日の両方に適用する。
node scripts/collect-setlist-comments.cjs ops/registration/review.json \
  ops/proposals/runtime/comments.json 20
```

今回の[レビュー入力](../../ops/registration/review.json)には19動画の種別/歌唱者/メタデータ、55行の曲/曲順/時刻/歌唱者のフィールド別確認を保存した。verifiedは「出典表記を確認した登録案」であり、人間がPRをマージしたことを意味しない。第6段階Aのcandidate.confirmedとは別で、pending候補が登録案へ自動昇格する経路はない。

承認はフィールド値のvalueHash＋根拠のevidenceHash＋公式URL＋確認日時。元候補のcandidateEvidenceHashも保持。`reconcileApprovals`は曲情報だけが変わった場合は曲を再確認にし、時刻等の未変更確認は旧根拠ハッシュ/過去レビューを残して保持する。動画/出典種別変更では流用しない。コメント由来の公開には、別途公式動画を確認したmanualReviewが必須。コメントURLだけの承認は拒否する。

登録案は4マスターをまとめて生成し、Schema/ID/参照/時刻/所属/公式根拠を既存validatorで検証する。動画ID、曲のidentityUrl、歌枠ID、位置/開始時刻を再照合。発行済み台帳の最大IDから採番し、割当をnextReviewに保存。今回の4ファイルは生成案を明示的に作業ブランチへ取り込んだもので、CLIの自動applyオプションは作っていない。

baseHash/resultHashで既存マスター全体の変更を検知する。並行PRのID/データ変更は失敗させ、最新mainから再生成・再レビューする。既存レコードの異なる内容は黙って上書きせず、期待ハッシュ・根拠・同じ内部IDを持つ明示的patchを要求する。削除操作なし。planは差分分類、allocated、nextReview、変更前4マスターのrollbackを持つ。再実行で新規0/変更0、同じresultHashになることを確認した。ロールバックもPRで行う。

## コメントの予算・キャッシュ・プライバシー

配信/日次発見に重い解析を組み込まず、コメントCLIは独立・手動。新しいCron/自動デプロイは追加していない。必要時に実行し、同じ動画/取得条件は24時間再取得しない。既定20単位/実行・Pacific日、最大10動画/各2ページ（CLIはレビュー内の動画を対象）、各リクエスト最大100コメント。明示上限は100単位まで。relevance/timeと、限定したsearchTerms（セトリ/セットリスト/曲一覧）に対応。全返信は取得せずcomments.listは未使用。

同じコメントID＋更新日時＋内容ハッシュ＋パーサー版は再解析しない。編集はneeds_reviewと旧ハッシュ履歴を残す。未取得/削除/コメント無効で公開記録を消さない。コメント無効/404はunavailableとして正常に継続し、認証/クォータ等は全体停止。要求/再試行ごとに独立予算を保存する。カーソル保存とatomic renameで再開、lockで同じstateの同時CLIを防止する。

本文全文・投稿者の情報・いいね数は保存しない。必要な曲名/時刻/元行/コメントID/投稿更新日時/根拠URL/ハッシュだけを非公開runtimeに保持し、取得から30日で削除/再取得対象にする。期限切れデータを使う前に破棄する。API由来候補の全文/キャッシュをGit履歴へ恒久保存せず、runtimeはgitignore/Pages allowlist外。今回のコメント候補もGitには追加していない。根拠URLは公のコメントへの参照であって、投稿者プロフィールの収集ではない。作業後の一時メタデータ全文も削除する。既存の正式な確認記録と、期限付きAPIキャッシュを分離する。

今回の実利用はvideos.list 2＋commentThreads.list 32＝**34要求/推定34単位**。返信0、検索API0、追加の有料サービス0。取得検証では環境のHTTPプロキシに合わせたワークスペース内のurllib transport注入を使い、Secret値/URL全体/API本文はログに出していない。プロジェクトの実際の割当/残量はGCP権限がなく未確認。同じGCPを使う可能性があるため別stateの予算はプロジェクト全体を拘束しない。20単位は余裕の保証ではなく、403等で停止して既存データを保持する。

## 表示・公開・検証

公開HTMLは既存のビルド時生成。音楽→曲→歌枠→タレントのリンク、時刻リンク、未確認リスト、動画IDとチャンネルIDが一致する場合だけの配信補助リンクを維持した。新UIは追加せずVersionは**2.8.0**、更新バナーも同じ。スケジュールHTML/JS/CSS/取得頻度/取得対象/日次workflow/404継続/公開ジョブは変更していない（共有パーサーの再利用とdiscovery専用adapterのコメント診断対応のみ）。

既存の初期3件/2カバーに固定されていた単体テストは、元の検証用fixtureを明示して維持した。実データの拡充・冪等性は別途全件で検証する。ブラウザーの件数は実マスターから算出し、従来の導線/時刻チェックを残す。データが増えただけでテストを削ってはいない。

表示比較（外部画像通信は遮断、固定日時、各画面の上部）：

|対象|390px Before / After|1440px Before / After|
|---|---|---|
|音楽|[前](screens/before/-music-390.png) / [後](screens/after/-music-390.png)|[前](screens/before/-music-1440.png) / [後](screens/after/-music-1440.png)|
|既存歌枠|[前](screens/before/-music-karaoke-karaoke-000001-390.png) / [後](screens/after/-music-karaoke-karaoke-000001-390.png)|[前](screens/before/-music-karaoke-karaoke-000001-1440.png) / [後](screens/after/-music-karaoke-karaoke-000001-1440.png)|

公開容量は[results.json](results.json)の同一データsnapshot比較。画像/音声/動画本体の追加は0、主な増分は52曲詳細と15歌枠詳細・JSON。Pages側のキュー/同期速度が改善したとは主張しない。内部レビュー/Schema/runtime/docs/Secretsが成果物へ入らないことを確認する。

未実装・保留：コメントだけの293行を含む独立検証、検出した32矛盾の解消、残り候補の種別/作品同一性、返却されなかった1動画、全編の完全性確認、全返信/全過去コメント、音声認識、ダッシュボード、イベント・グッズ収集（第6段階C）。件数を増やすためにこれらを承認扱いにしない。

最終ローカル検証：`npm run check`、`npm test`（150件）、`npm run build`、`CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`。全4幅/JS有無の回帰と、390/1440pxのスクリーンショットを確認。登録案の再実行は新規0/変更0。公開allowlistに内部ファイル・Secret値が混入しないことを確認した。
