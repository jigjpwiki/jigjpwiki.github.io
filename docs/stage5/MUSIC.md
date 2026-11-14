# PR B：楽曲・歌動画

PR A #16に依存するためdraft。Aをmainへマージしてから本PRのbaseをmainへ変更し、Files changedとCIを確認してreadyにする。**依存ブランチへマージしない**。現時点のbaseは差分レビューのためだけのfeat/v5-events。

## 実装と初期データ

`/music/`、`/music/songs/{id}/`、プロフィールの音楽セクション。曲・原曲アーティスト・別表記・読み・歌唱者/所属で探せる。歌動画はoriginal/cover/otherを保持するが、初期の実在データは**楽曲2件、歌ってみた2件、オリジナル動画0件（未収集）**。歌枠ページへのリンクはこの段階では出さない。

- [常磐カナメの動画](https://www.youtube.com/watch?v=d7SWtQptcpw)の説明欄「原曲：柿崎ユウタ」と原曲URLを確認。[原曲](https://www.youtube.com/watch?v=jorNAdLoRGg)のタイトルでも柿崎ユウタと楽曲名を照合。英語別表記は原曲タイトルにあるものだけを採用し、読みは推測せず空配列。
- [なるの動画](https://www.youtube.com/watch?v=e0JemZb45s8)の御本家URLから[原曲](https://www.youtube.com/watch?v=5Jja39-69G8)を確認。「Kanaria」「星街すいせい」の表記を原曲アーティストとして記録。別の同名曲を曲名一致だけで統合しない。
- 両歌唱者は公開動画のchannelIdを97名のアカウントIDへ照合。動画の公開日時は中央media台帳のpublishedAtを参照し、プレミア公開のliveStreamingDetailsを歌枠の証拠にはしない。

Song（song-ID）とMusicVideo（mv-ID）は独立。動画本体は中央media台帳のYouTube IDで一意であり、元の配信JSONをコピー/変更しない。MusicVideoのsongIdはnullも許可し、原曲を確定できない動画を無理に既存曲へ接続しない。曲のidentityUrlを正本の識別根拠とし、同じURLの二重発行を拒否。同名異曲は別の出典/原曲アーティストとIDで保持。原曲アーティストの不明値はnullで、unknownと矛盾するartistEvidenceを拒否する。

公開projectionはpublicの作品/歌動画と使う動画/出典だけを出す。draftの曲への公開リンク、誤った歌唱者/動画チャンネル、同じ動画の二重登録、危険なURL、台帳未発行、出典不明は検証エラーになる。可用性が変わっても履歴は保持し、確認済みの視聴不可を表示できる。歌詞全文・音源・動画本体は保存しない。

## リリース情報

Aの2.6.0から同じ形式の**2.7.0**へ。更新文は「楽曲検索・歌ってみた動画・タレント別の音楽情報を追加しました。」のみ。イベントはAの機能として維持するが、未実装の歌枠・セットリストを完成済みと告知しない。フッター/バナー/キャッシュ番号は同じrelease.jsonから生成する。

## 検証・負荷

check、98件のユニットテスト、build、全ブラウザーテスト成功。320/390/768/1440px・JS有効/無効、原曲アーティスト検索＋歌唱者の組合せ、解除・空状態、曲詳細・動画・プロフィールへの遷移、JST、version/バナーを確認。イベントと配信トップの回帰テストも維持。

公開サイズ A 37,823,754 → B 37,892,566 bytes（+68,812 bytes、4ファイル増）。ビルド1秒未満。原曲2件の確認でvideos.listを追加1回、Aとの累計2回。定期API増加0。画像/音源/動画本体は追加しない。公開allowlistにmusic.jsonと3ページを追加し、台帳/Schema/候補/docsは公開しない。

## 比較画像

Aと同じJST固定日時・空の配信fixture・外部画像遮断の比較。BeforeはA、AfterはB。実際の公開状況を示す画像ではない。

| 対象 | Before | After |
| --- | --- | --- |
| モバイルversion | [2.6.0](screens-a/after/schedule-390.png) | [2.7.0](screens-b/after/schedule-390.png) |
| PC version | [2.6.0](screens-a/after/schedule-1440.png) | [2.7.0](screens-b/after/schedule-1440.png) |
| 音楽検索 | 未実装 | [390px](screens-b/after/music-390.png) / [1440px](screens-b/after/music-1440.png) |
| 楽曲詳細 | 未実装 | [390px](screens-b/after/music-songs-song-000001-390.png) / [1440px](screens-b/after/music-songs-song-000001-1440.png) |

歌枠/セットリスト/よく歌う曲/候補抽出はCで扱う。自動公開・外部DB・ニュースは対象外。トップのカード/Swiper/取得・更新処理に変更なし。
