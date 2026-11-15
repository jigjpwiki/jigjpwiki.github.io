# PR C：歌枠・セットリストとレビュー候補

PR B #17に依存するdraft。#16をmainへマージ→#17のbaseをmainへ変更して差分/CI確認→#17をmainへマージ→本PRのbaseをmainへ変更して差分/CI確認、の順にreadyへ移す。**依存ブランチへマージして終了しない**。Squash/rebase mergeの場合は前PRのコミットがmainの祖先にならないことがあるため、後続固有の差分だけを最新mainへ再基準化してから確認する。未承認のmerge/force pushは行わない。

## 登録した実在データ

- 歌枠 **2件**：夏渚まはろ [文化祭後夜祭風歌枠](https://www.youtube.com/watch?v=w7E-oj1HOfc)、香鳴ハノン [アイドル縛り歌枠](https://www.youtube.com/watch?v=Gtj6VUcjVGM)。YouTube ID・本人channel IDを照合。配信日時はpublishedAtではなくactualStartTimeで表示する。
- 歌唱 **3件**：まはろの公式説明欄の「金曜日のおはよう / HoneyWorks」08:05、「世界は恋に落ちている / CHiCO with HoneyWorks」16:22、「すないぱー。 / 『ユイカ』」26:43。元の順番1/2/3と開始秒485/982/1603を保持し、終了時刻は補完しない。
- 楽曲 **3件追加**（Bと合計5）。3件の原曲アーティストは配信者の公式説明欄の表記としてartistEvidence=performer_descriptionで区別し、その旨をUIにも表示。原曲動画まで照合したBの2件と同じ確度だと主張しない。当初はこのアーカイブの時刻URLを仮の識別根拠にしていたが、これはSongとPerformanceの混同だったため第6段階Bで廃止した。現在は原曲公式情報でSongを識別し、歌枠時刻URLはPerformanceの出典に限定する。
- まはろの説明欄には31曲＋OPの表記があるが、公開するのは上記3曲のみ。**3/31曲、一部確認**と明示。確認方法はverificationMethod=official_descriptionで、曲目と時刻が説明欄由来であることを表示する。音声/字幕による楽曲認識は行っていない。
- ハノンは取得した公式説明欄にセットリストがなく、unreviewed、曲ごとの記録0件。「歌われていない」とは表示しない。
- タイトルの「文化祭後夜祭風」はテーマの説明なので、実在する文化祭の開催イベントへ自動変換していない。実在リレーの出演枠、オリジナル動画は今回未収集。

## 実装

`/music/karaoke/`、`/music/karaoke/{id}/`、楽曲の歌唱履歴、音楽トップの最近登録歌枠、タレントのアーカイブ・音楽導線。最近登録は配信日と分けてregisteredAtで並べる。歌枠は過去の配信JSONの保存期間に依存せず保持する。

Performanceは曲ID、順番、開始/終了秒、複数歌唱者、原文表記、補足、出典、確認方法/状態を持つ。曲ID・順番・開始秒はnullでも成立し、未確定を明示。nullの時刻を推定せず通常の動画リンクを使う。動画可用性が不明/視聴不可なら時刻再生を保証せず、過去の記録と出典は保持する。

同一動画をMusicVideoとKaraokeへ二重発行しない。曲・歌枠・歌唱者の参照、親歌枠の歌唱者、二重順番、時刻逆転/動画長超過、時刻と順番の矛盾、completeと曲数の不一致、未確認歌唱のpublic指定を拒否。イベント出演枠も既知の親イベントの開始前/終了後を拒否する。Completeは確認した全件と順番が揃った場合だけ許可し、部分的な記録を完全なセットリストとして出さない。確認済み0曲と未収集/未確認0件も別表示で検証した。

「登録済み歌枠でよく歌う曲」は**3つ以上の異なる歌枠**に確認済みpublic記録がある曲だけ。1配信内の繰り返しで水増ししない。今の実データでは条件を満たさず、ランキングは出さない。全活動の統計だと主張しない。

イベント/出演枠に登録済み歌枠のYouTube IDがあれば詳細リンクを追加できる。初期2イベントには同じ歌枠がないため、この連動はfixtureで検証した。

## 既存トップの変更は限定する

Appのカード内URL・子要素・Swiper・トグル・更新タイマー・取得関数は変更せず、wrapperへYouTube ID/channel IDをdata属性で渡す1行を追加。別JSが公開allowlistの小さなkaraoke-links.jsonを**ページ閲覧時1回だけ**読み、両IDが一致するカードの外へ補助リンクを付ける。元のYouTubeリンクは置き換えない。任意URLは受け取らず、検証済みkaraoke-IDから内部パスを構築する。

補助JSON取得失敗は無視し、配信取得・更新・表示を妨げない。再描画時にも二重リンクを作らない。定期Google API回数/収集頻度は増加0。YouTube/Twitch収集コードと監視対象JSONは変更しない。既存カードの幾何配置を変えるCSSではなく、該当する補助リンクのみのスタイルを追加した。

## 候補抽出と差分レビュー

`node scripts/propose-media.cjs input.json ops/proposals/review.json [previous.json]`。

- ローカルのAPI metadata export/既存feedと、必要なら公式告知のtitle/URLを読む。ネットワーク要求、鍵の参照、マスター更新は一切しない。
- 動画タイトルの歌枠/KARAOKE/歌ってみた/cover/リレー/お披露目等はヒントだけ。チャンネルIDで既存タレントへ照合し、未照合は空配列。曲名や文章の人物名だけで紐づけない。
- 説明欄の時刻行は原文ラベル、明記された順番、秒数を候補へ抽出。OP等も章候補として残し、曲だと自動断定しない。候補のsongIdは常にnull。音声・字幕は処理しない。
- URL/最大長/字段をSchemaで検証し、説明欄本文や歌詞全文・認証情報はコピーしない。出力先はops/proposals以下に制限し、公開dataや_siteには書けない。
- 新規/変更/一致/既登録/入力欠落を識別。変わった根拠や入力欠落はpendingへ戻す。部分feedやローリング保存範囲からの欠落は削除の証明ではなく、公開動画の再確認を要求する。
- 今回のローカル実行では公式metadata7動画＋公式ライブ告知から**8候補、時刻行32件（OPを含む）**。全てpendingで、[review.json](../../ops/proposals/review.json)に分離。既登録IDは候補内で参照するが、候補がconfirmedになっても公開マスターへ自動取り込みはしない。
- 実行前後にdata/*.jsonのハッシュが全て同じことを確認。公開は手動で根拠を照合・ID発行し、人間がPRをレビューしてから行う。

## Versionと検証

Bの2.7.0から**2.8.0**へ。同じrelease.jsonから、イベント・楽曲に加え歌枠/セットリスト/配信カード導線が加わる旨を案内。PC/スマホのフッターとバナーを確認し、データ-only変更に番号アップを強制しない仕組みも維持する。

check、**111件のユニットテスト**、build、全ブラウザーテストが成功。320/390/768/1440px・JS有効/無効、日付/所属/歌唱者/確認状態フィルター、時刻リンク、楽曲⇄歌枠⇄プロフィール、引用文字列のエスケープを確認。配信カードにだけ公開JSONで指定したリンクが付くこと、元URL不変、JSONの503でもカードが表示されることを検証。既存トップの5幅の回帰テストも通過。

全イベント/楽曲/歌枠の生成先とsitemap、台帳/Schema/ops/docs/fixturesの公開除外を検証。候補本文・鍵・descriptionは公開JSONにない。API確認はA+Bのvideos.list計2回だけで、Cの追加APIは0。候補抽出はオフライン。常駐サーバー、DB、有料サービス、Wiki書き込み、ニュース、自動公開は導入しない。

## 画面比較

JST 2026-11-15 12:00固定。一般の画像は外部遮断し、配信は空fixture。カード比較のみ同じ確認済み動画ID/チャンネルの1件を当日のfixture日時で注入し、ローカルplaceholder画像を使用（本番データを変更していない）。BeforeはB、AfterはC。390/1440pxのセットリストと補助リンクを目視した。

| 対象 | Before | After |
| --- | --- | --- |
| モバイルversion | [2.7.0](screens-b/after/schedule-390.png) | [2.8.0](screens-c/after/schedule-390.png) |
| PC version | [2.7.0](screens-b/after/schedule-1440.png) | [2.8.0](screens-c/after/schedule-1440.png) |
| 配信カードの補助リンク | [390px](screens-c/card-before/schedule-390.png) / [1440px](screens-c/card-before/schedule-1440.png) | [390px](screens-c/card-after/schedule-390.png) / [1440px](screens-c/card-after/schedule-1440.png) |
| 歌枠一覧 | 未実装 | [390px](screens-c/after/music-karaoke-390.png) / [1440px](screens-c/after/music-karaoke-1440.png) |
| セットリスト | 未実装 | [390px](screens-c/after/music-karaoke-karaoke-000001-390.png) / [1440px](screens-c/after/music-karaoke-karaoke-000001-1440.png) |
| 楽曲の歌唱履歴 | 未収集 | [390px](screens-c/after/music-songs-song-000003-390.png) / [1440px](screens-c/after/music-songs-song-000003-1440.png) |

画像はdocsに置き、Pages artifactに含めない。未実装は自動取り込み/承認UI、全31曲の公開整備、他の歌枠/実在リレー枠/オリジナル曲の登録、字幕/音声認識、ニュース。これらを実装済みとバナーに記載しない。

## 公開負荷

同じ配信snapshotでB 37,892,566 → C 37,948,471 bytes（+55,905 bytes、+9ファイル）。mainからの累計は+177,281 bytes（約173.1 KiB、約0.47%）、311ファイル。buildは約0.4秒で、Pages側のキュー/同期時間の保証ではない。静的JSONの補助要求は1回/閲覧で、Google API要求ではない。公開画像・音源・動画バイナリの追加なし。
