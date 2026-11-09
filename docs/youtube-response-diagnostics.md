# YouTube items欠損の調査と修正

対象: [Actions run 42661657158](https://github.com/jigjpwiki/jigjpwiki.github.io/actions/runs/42661657158)、update job 129314521116。

## 確認できたこと

2026-11-10 02:08:35 JST（11月9日17:08:35 UTC）、YouTube収集は `YOUTUBE_REFRESH_ONLY=auto` で開始し、`Invalid API response: items must be an array` で終了した。HTTPエラーやJSONパースエラー用の別メッセージではなく、`arrayField`の検証で失敗している。HTTP 2xx相当でオブジェクトを得た後、いずれかのlistのitemsが配列でなかったことまでは分かる。当時はendpoint/status/kind/pageInfoが記録されておらず、それだけではゼロ件と異常を判別できない。

checkoutされたcommitは `8f2e566973d9e85d0b0df2aa197d5992595ae451`。そのstreamers/cacheを復元すると、最後の探索は06:32:01 UTCで、autoは探索を行う経路となる。未登録・再確認期限到来のチャンネルは4件で、最初の呼出しはこの4件への `channels.list` となる。

この最初のバッチだけを読み取りで再照会すると、以下を確認できた（全収集やsearchの実API実行は行っていない）。診断にはID、APIキー、URL、本文、etag等を保存していない。

| メタデータ | 再照会で確認した値 |
| --- | --- |
| HTTP | 200 |
| endpoint | channels.list |
| kind | youtube#channelListResponse |
| pageInfo.totalResults | 0 |
| pageInfo.resultsPerPage | 5 |
| items | プロパティ自体が欠損 |
| error / 次ページ | なし |

これは正しいlist種別のゼロ件応答で、旧コードに与えると同じエラーになる。`resultsPerPage`はこの応答では0でなく5であり、返却件数と一致する前提にしない。**この空結果を誤って失敗扱いする不具合は再現できた。ただし当時の本文はなく、対象runが全く同じ応答だったとの断定はできない。** 別endpointの異常や一時的な応答異常の可能性を排除するため、今後は安全な診断情報を残す。

実APIの確認は読み取りのみ。初回のnode-fetch確認は完了せず、その後継承プロキシ対応のnative fetchで上記のバッチ照会を1回成功させた。成功したchannels.list照会は1リクエスト（通常1 quota unit）。全収集、追加search、Actions再実行、データ保存は行っていない。

対象runの `YOUTUBE_RESULT=failure` によりworkflowはyoutube.json/cacheをgit restoreしている。生成commit `6161c7574`の変更はtwitch.jsonとlast_updated.jsonだけで、当該runがyoutube.jsonを消した証拠はない。

## 修正

- 四つのlistを共通の境界で検証。itemsが明示された配列なら既存の検証へ進む。kindがある場合はendpointとの一致を確認する。
- items欠損を空配列に正規化するのは、正しいkind、数値totalResults=0、有効な数値resultsPerPage（0〜50）、errorなし、次ページなしの場合だけ。null/文字列/オブジェクトのitems、totalResultsが正数または欠損、種別不一致などは異常として中断する。単純な `items || []` は使わない。
- HTTP statusはWeakMapでJSONとは別に保持し、四つのendpoint名、型、許可したkind、数値pageInfo、itemsの型/件数、error/次ページの有無だけを診断に用いる。任意の文字列・フィールド名・API error messageは出力しない。HTTPエラー時は本文を読み出さずstatus/endpointを記録する。
- CLIは異常時、検証済みゼロ件のitems欠損は正規化時に診断を記録する。URL全体、キー、認証情報、ID、ページトークン、本文は記録しない。未知のkindや不正なカウンタは固定ラベル/nullで示す。
- 全API呼出しの完了後にのみsaveResultへ進む既存構造と原子的な個別ファイル置換、workflowの復元制御を維持。途中の取得失敗ではyoutube.json/cache/更新時刻を一切書き換えない。正当なvideos.listゼロ件で非公開・削除IDを取り除く従来動作とは区別する。
- 定期間隔、探索budget、キャッシュ、ページネーション、バッチサイズ、リトライ回数は変更しない。診断用の追加API呼出しは実装にない。これまで先頭で中断していた収集が正常に進む分は、本来予定していた処理量に戻る。

## 検証

`tests/youtube-response.test.js`に18テストを追加。4 endpointそれぞれで、ゼロ件省略/明示空配列、不正な形状・kind・カウンタ、HTTP 401/403/429/500、JSONエラー、error envelope、通信エラー、秘密を模した値の非露出を確認する。途中失敗時の各ファイルのバイト一致、追加呼出し/リトライがないこと、当該ゼロ件の再現と既知動画の維持、正当なvideos.list空結果も検証する。

`npm run check`、全49テスト、`npm run build`は成功。PRの既存CIでbrowser回帰も検証する。main直接コミット、マージ、本番反映、workflow_dispatchは行わない。
