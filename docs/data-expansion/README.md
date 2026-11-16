> 過去の実装・調査記録です。出典管理に関する記述は廃止されました。現行仕様は [移行仕様](../source-retirement/README.md) を参照してください。

# 第4段階：既存Wiki・JSONの照合と登録記録

基準main：`7bcfefd83`（#14マージ済み）。新機能・UI・収集対象は変更せず、人がレビューする静的マスターを拡充した。オンライン取り込みや定期スクレイピングは導入していない。

## 実際に登録した件数

| 項目 | 変更前 | 変更後 | 今回 |
| --- | ---: | ---: | ---: |
| タレント | 4 | 97 | **新規93、既存更新0** |
| 組織 | 1 | 5 | 新規4 |
| グループ | 1 | 11 | 新規10、既存STAR 1期生に銘兎目あうを補完 |
| 記念日 | 8 | 91 | **新規83（誕生日78・デビュー5）** |
| 旧所属を持つ人物 | 1 | 14 | 新規13（卒業・退学5、契約解除2、活動終了6） |

候補は**127名**。97名を収録済み（既存4＋新規93）、**30名を人物単位で保留**。非人物の公式5チャンネルは候補人数に含めない。YouTube監視JSON 97行は95個の異なるIDで、重複行が2件ある。Twitchは9行。既存のTikTok監視定義を含む他ファイルも確認し、今回のタレント化の起点になるのはYouTube/Twitchの上記ファイルだった。既存配信データ内の共演名から候補を増やしていない。

`candidates.json` は127名の調査範囲・結果・保留理由、`accepted.json` は新規93名の内部ID・本人根拠・登録した所属状態・照合したアカウントIDの台帳。いずれもdocs下で公開allowlistの対象外。Wiki全文、認証情報、レスポンス原文は含めない。

## 情報源と読み取り

- [jig.jp非公式Wiki](https://wikiwiki.jp/jigjp/)：MenuBar、各事務所のメニュー、所属・卒業一覧、プロフィール、所属履歴、活動場所早見表を横断。Wikiは `kind=wiki` を保持し公式として扱わない。
- 通常WikiページはHTTP 403だったため、既存 `stream-videos-restapi/src/services/wikiwiki.js` と同じ許可済みAPIを利用。既存の環境変数から認証し、`POST /auth` と `GET /page/{name}` のみ。PUT等の書き込みはない。パスワード・トークン・リクエスト本文はログにも成果物にも出さない。Nodeの直接接続が失敗したため、環境標準のネットワーク設定を使うPython urllibで読み取った。アクセス制限の解除・回避はしていない。
- [ProForma Nova公式名簿](https://www.proforma-production.jp/talents) と10名の公式プロフィール、STAR 1期生・MOON・METEOR等の公式ニュース。
- [パレデミア学園公式](https://www.parerdemia.jp/) の4寮の名簿・全64名の現公式プロフィール（学籍番号の個別ページ）。Wikiの卒業寮生も候補に含めた。
- [Palette Project公式名簿](https://paletteproject.jp/member) の8名と、ページの `RouteHeart` / `REGALILIA` / `Sputrip` 各セクションの所属構造。卒業生は本人名付き公式告知とWiki履歴を照合。
- [登龍門BOX公式名簿](https://www.vmon.jp/box-talents) の秋桜しゅお。オーディション番組の出演者一覧を所属一覧と扱わない。
- [jig.jp VTuber事業紹介](https://vtuber.jig.jp/) と「なる」本人の公式チャンネル説明にある株式会社jig.jp所属の明記。準備中をactiveと推定せず、2027年2月予定だけではデビュー記念日を作らない。
- Wikiで示された公式X投稿は公開用oEmbedで取得。投稿本文に日付が出ない画像告知は日付を補完しない。投稿者はoEmbedの実際の著者・パーマリンクを確認し、推測した投稿者名のURLを出典にしない。
- YouTubeのID・公開ハンドル照合は既存キーを保護した一時的な `channels.list(part=snippet)` を**4リクエスト**だけ利用（94 IDの2バッチ、卒業生3 ID、公式/Wikiで補足した2 IDの各1バッチ）。検索API・動画APIの呼び出しや定期収集頻度の追加はない。監視JSONの不正IDは変えず、正しいIDを照合できた場合だけタレントマスターに採用。

公式ページ・YouTube・WikiごとのURLと実際の確認日時は `data/talents.json` / `data/catalog.json` のsourcesに記録。公式プロフィールURLはID台帳の `officialProfileUrl` と公開出典に保持。スキーマに専用プロフィールURLフィールドを追加する必要はなかった。

## 採用基準・注意点

- 名前の一致だけでは統合しない。公式プロフィールからのSNSリンクとWikiプロフィールのリンク、YouTubeの不変IDと返されたハンドルを照合。小澄くろまる・猫吸はぴ・橙葉ぽんは公式プロフィール、Wikiの公式リンク、本人チャンネルの明示したProForma Nova所属を組み合わせた。Xは本人チャンネルが自己SNSとして示したリンクだけを採用し、イラストレーター等のリンクを取り込まない。
- 公式プロフィールのヘッダー/フッターにある事務所共通アカウントを本人アカウントから除外。Palette Project等の公式5チャンネルは人物化しない。既存4名のオブジェクトとID台帳アンカーはそのまま保持。
- 全ての新規「現在所属」は現公式名簿/プロフィールまたは本人による明示を根拠とする。新規80名が現在所属、13名が旧所属。旧所属者の現在の事務所状態はunknown。卒業・契約解除だけで引退としない。
- 新規の活動状態は**87名がunknown**。6名だけ（日本晴ここ、六連星なる、月宮あお、鎖乙女がぶ、彩音るか、愛染アネラ）について公式が明記した「活動終了」をendedとして登録。配信の頻度やアカウントの消失から推定していない。愛染アネラはWikiが引用する[公式告知画像](https://pbs.twimg.com/media/HFd85uIb0AAtdaG.jpg)を読み、2026-06-29の記載を確認した。
- 遠坂ユラは卒業後のソロ活動予定が公式本文にあるため活動終了にしない。神菜コハネは本人のYouTube説明で2023-01-31卒業を確認し、活動状態はunknown。パレデミアの4名は本人名付き「退学」「契約解除」を確認したが画像内の実施日を取得できていないため終了日はnull、活動状態もunknown。
- 「六連星なる」と「なる」は別人物として扱い、部分的な名前一致で統合しない。変幻リメのWiki内の旧/新ページは同じチャンネルだが、所属変更の確証不足により人物ごと保留した。元IDの再利用や転生推定はしない。
- 誕生日78件は公式プロフィールの月日だけで登録。生年・年齢は追加しない。しーはむ（2/10）と橙葉ぽん（8/21）のデビューは本人の明記を採用するが年が未確認のためnull・周年計算なし。小澄くろまるは本人の明記した2026-08-21、秋桜しゅおは2024-12-01、銘兎目あうは公式STAR 1期生デビューの2025-03-07を採用。
- なかもとおまちの2025-07-16、しーはむの2025-07-18の所属/紹介ニュースは既存VTuberの加入であり、最初のデビュー日へ変換しない。グループの始動日の月日や一度限りのイベントは推測して追加しない。
- 新規グループは全て `membersComplete=false`。現名簿を照合していても全歴代メンバーの完全性は保証しない。内部ユニット/寮は組織とは別ID。グループ台帳には現在/旧所属・所属期間のフィールドがなく、「確認済みの関連」という既存UIの意味を維持。REGALILIAは公式で卒業を確認できる遠坂ユラの過去の関係も残す。グループ在籍履歴の構造化は将来の別スキーマ拡張が必要。
- 表示名を取り込むために根拠の検証を無効化していない。唯一のアカウント検証の拡張はTikTokに限ったドット入りID（例 `rose.damaskht`）。他サービス・不一致ID・秘密情報付きURLの拒否を維持。記念日の同一種別/対象/日付を別IDで重複登録するケースを意味検証でも拒否する。

## 組織別の登録対象と根拠

### ProForma Nova（org-000001）

現在9名、旧所属1名。

| 内部ID | 表示名 | 区分 | 本人・所属の主な公式根拠 |
| --- | --- | --- | --- |
| tal-000001 | 真昼ねる | 既存・現在 | [公式](https://www.proforma-production.jp/t/mahiru-neru) |
| tal-000002 | 火乃晴るい | 既存・現在 | [公式](https://www.proforma-production.jp/t/hinoha-rui) |
| tal-000003 | 水透ユウ | 既存・現在 | [公式](https://www.proforma-production.jp/t/minato-yu) |
| tal-000004 | 李じゅぴ汰 | 既存・旧所属 | [公式](https://www.proforma-production.jp/t/lee-jupita) |
| tal-000013 | しーはむ | 新規・現在 | [公式](https://www.proforma-production.jp/t/siyham) |
| tal-000014 | なかもとおまち | 新規・現在 | [公式](https://www.proforma-production.jp/t/nakamotoomachi) |
| tal-000015 | 小澄くろまる | 新規・現在 | [公式](https://www.proforma-production.jp/t/kozumi-kuromaru) |
| tal-000016 | 橙葉ぽん | 新規・現在 | [公式](https://www.proforma-production.jp/t/touha-pon) |
| tal-000017 | 猫吸はぴ | 新規・現在 | [公式](https://www.proforma-production.jp/t/nekosui-hapi) |
| tal-000018 | 銘兎目あう | 新規・現在 | [公式](https://www.proforma-production.jp/t/metome-au) |

### パレデミア学園（org-000002）

現在64名、旧所属4名。

| 内部ID | 表示名 | 区分 | 本人・所属の主な公式根拠 |
| --- | --- | --- | --- |
| tal-000019 | さくさくさく | 新規・現在 | [公式](https://www.parerdemia.jp/students/26ME004) |
| tal-000020 | シグマ・イングラム | 新規・現在 | [公式](https://www.parerdemia.jp/students/25CO002) |
| tal-000021 | フローレ・ブランカ | 新規・現在 | [公式](https://www.parerdemia.jp/students/25WA004) |
| tal-000022 | ローズ・ダマスクハート | 新規・現在 | [公式](https://www.parerdemia.jp/students/25WH012) |
| tal-000023 | 七音うら | 新規・現在 | [公式](https://www.parerdemia.jp/students/25WH015) |
| tal-000024 | 久堂れしあ | 新規・現在 | [公式](https://www.parerdemia.jp/students/25WH007) |
| tal-000025 | 亀城ちかり | 新規・現在 | [公式](https://www.parerdemia.jp/students/25ME011) |
| tal-000026 | 冬星れんこん | 新規・現在 | [公式](https://www.parerdemia.jp/students/26WA003) |
| tal-000027 | 四葉みっけ | 新規・現在 | [公式](https://www.parerdemia.jp/students/26WH004) |
| tal-000028 | 堂下さとり | 新規・現在 | [公式](https://www.parerdemia.jp/students/25WA008) |
| tal-000029 | 夏凪はつみ | 新規・現在 | [公式](https://www.parerdemia.jp/students/26CO006) |
| tal-000030 | 夕凪万夜 | 新規・現在 | [公式](https://www.parerdemia.jp/students/26CO005) |
| tal-000031 | 夜宵カレン | 新規・現在 | [公式](https://www.parerdemia.jp/students/25ME013) |
| tal-000032 | 夜雨ねむる | 新規・現在 | [公式](https://www.parerdemia.jp/students/26CO001) |
| tal-000033 | 夢ト見りんね | 新規・現在 | [公式](https://www.parerdemia.jp/students/25WA011) |
| tal-000034 | 天堂ライラ | 新規・現在 | [公式](https://www.parerdemia.jp/students/26CO004) |
| tal-000035 | 天辻ゆらぐ | 新規・現在 | [公式](https://www.parerdemia.jp/students/25CO014) |
| tal-000036 | 天透あわ | 新規・現在 | [公式](https://www.parerdemia.jp/students/25WA009) |
| tal-000037 | 天麗らん | 新規・現在 | [公式](https://www.parerdemia.jp/students/26ME001) |
| tal-000038 | 宵坂伊織 | 新規・現在 | [公式](https://www.parerdemia.jp/students/26CO002) |
| tal-000039 | 山田スバル | 新規・現在 | [公式](https://www.parerdemia.jp/students/25CO010) |
| tal-000040 | 巳野みこと | 新規・現在 | [公式](https://www.parerdemia.jp/students/26WA006) |
| tal-000041 | 彼方ルカ | 新規・現在 | [公式](https://www.parerdemia.jp/students/25CO013) |
| tal-000042 | 恋歌さわこ | 新規・現在 | [公式](https://www.parerdemia.jp/students/25ME010) |
| tal-000043 | 愛上オハナ | 新規・現在 | [公式](https://www.parerdemia.jp/students/25WA013) |
| tal-000044 | 愛乃宮ゆめ | 新規・現在 | [公式](https://www.parerdemia.jp/students/25CO003) |
| tal-000045 | 愛葉はな | 新規・現在 | [公式](https://www.parerdemia.jp/students/25ME005) |
| tal-000046 | 新巻るろな | 新規・現在 | [公式](https://www.parerdemia.jp/students/25ME001) |
| tal-000047 | 東雲アカリ | 新規・現在 | [公式](https://www.parerdemia.jp/students/25ME014) |
| tal-000048 | 桜堂ねる | 新規・現在 | [公式](https://www.parerdemia.jp/students/25WH006) |
| tal-000049 | 桜庭羽奈 | 新規・現在 | [公式](https://www.parerdemia.jp/students/25CO004) |
| tal-000050 | 桜雲ほわり | 新規・現在 | [公式](https://www.parerdemia.jp/students/25CO011) |
| tal-000051 | 水凪るぅ | 新規・現在 | [公式](https://www.parerdemia.jp/students/26WA004) |
| tal-000052 | 水無瀬天 | 新規・現在 | [公式](https://www.parerdemia.jp/students/25WH011) |
| tal-000053 | 氷雨セイ | 新規・現在 | [公式](https://www.parerdemia.jp/students/25ME003) |
| tal-000054 | 汐月永遠 | 新規・現在 | [公式](https://www.parerdemia.jp/students/26ME002) |
| tal-000055 | 瀬奈りるか | 新規・現在 | [公式](https://www.parerdemia.jp/students/25CO005) |
| tal-000056 | 火狐むい | 新規・現在 | [公式](https://www.parerdemia.jp/students/26WH005) |
| tal-000057 | 灯野ぺけ。 | 新規・現在 | [公式](https://www.parerdemia.jp/students/25ME006) |
| tal-000058 | 無月いお | 新規・現在 | [公式](https://www.parerdemia.jp/students/26WH003) |
| tal-000059 | 牡丹雪 | 新規・現在 | [公式](https://www.parerdemia.jp/students/26ME003) |
| tal-000060 | 犬丸なでこ | 新規・現在 | [公式](https://www.parerdemia.jp/students/25WA001) |
| tal-000061 | 狛社なの | 新規・現在 | [公式](https://www.parerdemia.jp/students/26WA005) |
| tal-000062 | 猫乃間うと | 新規・現在 | [公式](https://www.parerdemia.jp/students/25CO012) |
| tal-000063 | 畑スイカ | 新規・現在 | [公式](https://www.parerdemia.jp/students/25CO009) |
| tal-000064 | 白尾すず | 新規・現在 | [公式](https://www.parerdemia.jp/students/26WA001) |
| tal-000065 | 相栖るじゅ | 新規・現在 | [公式](https://www.parerdemia.jp/students/25WA010) |
| tal-000066 | 緋月・ローズ・ブレイド | 新規・現在 | [公式](https://www.parerdemia.jp/students/25WH010) |
| tal-000067 | 緋雨柚 | 新規・現在 | [公式](https://www.parerdemia.jp/students/25ME004) |
| tal-000068 | 翡翠あかね | 新規・現在 | [公式](https://www.parerdemia.jp/students/26WA002) |
| tal-000069 | 花晴りら | 新規・現在 | [公式](https://www.parerdemia.jp/students/25WH005) |
| tal-000070 | 藤森ちとせ | 新規・現在 | [公式](https://www.parerdemia.jp/students/25WH004) |
| tal-000071 | 鈴木沙透 | 新規・現在 | [公式](https://www.parerdemia.jp/students/25ME009) |
| tal-000072 | 銀河キララ | 新規・現在 | [公式](https://www.parerdemia.jp/students/26ME005) |
| tal-000073 | 陰山アゲハ | 新規・現在 | [公式](https://www.parerdemia.jp/students/25ME007) |
| tal-000074 | 雛菊のん | 新規・現在 | [公式](https://www.parerdemia.jp/students/25ME012) |
| tal-000075 | 雨海まる | 新規・現在 | [公式](https://www.parerdemia.jp/students/25WA005) |
| tal-000076 | 雪紫誉 | 新規・現在 | [公式](https://www.parerdemia.jp/students/26WH002) |
| tal-000077 | 露草なぎ | 新規・現在 | [公式](https://www.parerdemia.jp/students/26WH001) |
| tal-000078 | 音海まいる | 新規・現在 | [公式](https://www.parerdemia.jp/students/25ME008) |
| tal-000079 | 飛渡ココ | 新規・現在 | [公式](https://www.parerdemia.jp/students/25WA002) |
| tal-000080 | 香桜あんにん | 新規・現在 | [公式](https://www.parerdemia.jp/students/26CO003) |
| tal-000081 | 黄金つむぎ | 新規・現在 | [公式](https://www.parerdemia.jp/students/25WA012) |
| tal-000082 | 黒鋼亜華 | 新規・現在 | [公式](https://www.parerdemia.jp/students/25WH001) |
| tal-000093 | 采多しゆあ | 新規・旧所属 | [公式](https://x.com/parerdemia/status/2086648736919474488) |
| tal-000094 | 神童めしあ | 新規・旧所属 | [公式](https://x.com/parerdemia/status/2097203279608320171) |
| tal-000095 | 斗瀬ひおり | 新規・旧所属 | [公式](https://x.com/parerdemia/status/2066438060133220843) |
| tal-000096 | ニコ・ダークウェル | 新規・旧所属 | [公式](https://x.com/parerdemia/status/2110249242853888337) |

### Palette Project（org-000003）

現在8名、旧所属9名。

| 内部ID | 表示名 | 区分 | 本人・所属の主な公式根拠 |
| --- | --- | --- | --- |
| tal-000005 | 七海ロナ | 新規・現在 | [公式](https://paletteproject.jp/member/case-rona/) |
| tal-000006 | 夏渚まはろ | 新規・現在 | [公式](https://paletteproject.jp/member/case-mahalo/) |
| tal-000007 | 常磐カナメ | 新規・現在 | [公式](https://paletteproject.jp/member/case-kaname/) |
| tal-000008 | 暁月クララ | 新規・現在 | [公式](https://paletteproject.jp/member/case-clara/) |
| tal-000009 | 江波キョウカ | 新規・現在 | [公式](https://paletteproject.jp/member/case-kyouka/) |
| tal-000010 | 藤宮コトハ | 新規・現在 | [公式](https://paletteproject.jp/member/case-kotoha/) |
| tal-000011 | 香鳴ハノン | 新規・現在 | [公式](https://paletteproject.jp/member/case-hanon/) |
| tal-000012 | 鬼多見アユム | 新規・現在 | [公式](https://paletteproject.jp/member/case-ayumu/) |
| tal-000084 | 白銀ヘレナ | 新規・旧所属 | [公式](https://paletteproject.jp/shiroganeherena_20191106/) |
| tal-000085 | 遠坂ユラ | 新規・旧所属 | [公式](https://x.com/PaletteProject_/status/1371797985168744452) |
| tal-000086 | 神菜コハネ | 新規・旧所属 | [公式](https://x.com/KaminaKohane/status/1612839371039977473) |
| tal-000087 | 日本晴ここ | 新規・旧所属 | [公式](https://x.com/PaletteProject_/status/1889147349370306783) |
| tal-000088 | 六連星なる | 新規・旧所属 | [公式](https://x.com/PaletteProject_/status/1961640022593212818) |
| tal-000089 | 月宮あお | 新規・旧所属 | [公式](https://x.com/PaletteProject_/status/1961640022593212818) |
| tal-000090 | 鎖乙女がぶ | 新規・旧所属 | [公式](https://x.com/PaletteProject_/status/2008750443074383895) |
| tal-000091 | 彩音るか | 新規・旧所属 | [公式](https://x.com/PaletteProject_/status/2008750443074383895) |
| tal-000092 | 愛染アネラ | 新規・旧所属 | [公式](https://x.com/PaletteProject_/status/2042452515547910253) |

### 登龍門BOX（org-000004）

現在1名、旧所属0名。

| 内部ID | 表示名 | 区分 | 本人・所属の主な公式根拠 |
| --- | --- | --- | --- |
| tal-000083 | 秋桜しゅお | 新規・現在 | [公式](https://www.vmon.jp/box-talents/profile/syuou-syuo) |

### 株式会社jig.jp（org-000005）

現在1名、旧所属0名。

| 内部ID | 表示名 | 区分 | 本人・所属の主な公式根拠 |
| --- | --- | --- | --- |
| tal-000097 | なる | 新規・現在 | [公式](https://www.youtube.com/channel/UCMX0Mn5PTjojdQL8MN1B5Vg) |

## 保留・未確定項目

**人物単位の保留30名**は[candidates.json](candidates.json)の `result=held`。人物の登録保留と、登録済み人物の不明フィールドを混ぜて件数を水増ししない。

| 対象 | 保留した項目と理由 |
| --- | --- |
| 猫乃間うと | 監視JSONの `UCOH9jshsynMeCSRlPhiC` は短すぎる。Wikiの完全ID `UCOH9jshsynMeCSRlPhiCSvw` を公式プロフィールのハンドルとchannels.listで照合してマスターだけに採用。監視定義の修正は未実施。 |
| しーはむ・橙葉ぽん | デビューの月日は本人が明記するが起点年は今回未確認。年を補完せず周年計算なし。 |
| 猫吸はぴ | Wikiの日付はあるが取得した本人説明にデビューの年月日がなく未登録。 |
| なかもとおまち | 新所属での紹介日と個人としての初デビュー日を分離。今回デビュー記念日を追加していない。 |
| 秋桜しゅお | Wikiの誕生日は取得した公式プロフィールにはなく、公式根拠未確認で未登録。 |
| 遠坂ユラ | 公式の卒業告知を確認したが投稿日をそのまま卒業実施日にしない。終了日はnull。 |
| 六連星なる・月宮あお | 公式本文では9/14–15の併記まで。Wikiの個別対応を公式画像で確認できず、どちらの日かはnull。活動終了自体は公式が明記。 |
| パレデミア旧所属4名 | 退学・契約解除の本文見出しを確認。画像内の終了実施日は未確認のためnull。活動状態は推測しない。 |
| なる | デビューは2027年2月予定まで。予定月から日を補完したり、年次記念日を生成しない。 |
| 李じゅぴ汰（既存） | 現公式名簿にはプロフィールが残る一方、既存マスターは卒業確認済み。元の旧所属/unknownを保持し、名簿への残存だけで現在所属へ戻さない。 |

Palette Projectの旧所属者に関する移籍先や過去の組織階層、グループの在籍期間は確証がないまま追加しない。特にENILISの終了告知だけからjig.jp系での過去の所属を補完しない。MateReal / ENILISへの移行の正確な根拠が揃えば、同じ人物IDの履歴へ追記する。

## 検証と公開負荷

- スキーマ、ID台帳、既存4名のオブジェクト不変、本人/公式アカウント重複、参照整合性、卒業と活動状態の独立、誕生日の生年なし、記念日重複を検証。
- テストの固定「4名」を登録数追従へ変更。日付ロジックの既存8記念日fixtureは維持し、新しいデータそのものの検証を別テストに追加。ダミー組織のIDも実データと衝突しない値へ変更。
- 全97名の詳細ページとsitemapを生成確認。ブラウザーでは全5組織・全11グループの候補ID集合、名前＋現在/旧所属＋グループの複合検索、日付選択・同日複数件・月移動・JST・JS無効を検証。
- 320/390/768/1440pxで一覧・個別・記念日・グッズが横に溢れず、配信トップの既存回帰テストも維持。
- 公開allowlistを変えず、docs、台帳、スキーマ、収集定義、テストや認証情報を公開しない。公開対象に画像バイナリを追加せず、公式の小さいYouTubeアイコン等のURLのみ利用。
- 変更前199ファイル/36,988,768 bytes → 変更後292ファイル/37,769,076 bytes。差分は93ページとJSON等で**780,308 bytes（約762 KiB、約2.1%）**。取得キー・API応答全文・Wiki全文・内部調査ファイルは公開しない。
- ローカルbuildは変更前594ms、変更後295msの一測定。どちらも1秒未満だが、環境の揺らぎがあるため高速化を主張しない。Pagesのキュー・同期時間は本PRから保証できない。

配信トップのHTML/CSS/JS、YouTube/Twitch収集処理・頻度、監視対象JSON、ワークフロー・本番設定は一切変更していない。Wikiへの書き込み・mainへの直接コミット・PRマージは実施しない。

## 検証結果

`npm run check`、`npm test`（86件）、`npm run build`、`CHROMIUM_PATH=/usr/bin/chromium npm run test:browser` は全て成功。

390/1440pxで新規タレントの複合検索と記念日を撮影。JST 2027-11-26 12:00の固定テスト日時で、外部画像を遮断したフォールバック表示です。画像はdocs下のみで公開Artifactには入りません。両画面幅の画像を目視し、長い名前や記念日が横に溢れないことを確認しました。

| 対象 | 390px | 1440px |
| --- | --- | --- |
| 新規タレント検索 | [画面](screens/talent-filter-390.png) | [画面](screens/talent-filter-1440.png) |
| 記念日 | [画面](screens/anniversary-390.png) | [画面](screens/anniversary-1440.png) |
