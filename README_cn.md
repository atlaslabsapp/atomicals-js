# Atomicals Javascript 库特别版本

此版本仅适用于在广播了“提交（commit）交易”但未广播“揭示（reveal）交易”时恢复您的比特币。
这种情况看起来像是您的比特币被发送到了一个对您来说不熟悉的地址上，并且您没有得到任何回报。
- 当在 `.env` 配置文件中设置 `refund=true` 时，它会尝试从提交交易中退款。
  您应该设置一个比原始设置低得多的 `newSatsbyte` 或 `--satsbyte`，否则您可能只能拿回很少sats。
- 当设置 `refund=true` 时，它会尝试构建继续铸造的揭示交易。
  当物品还没有被铸造完时，强烈推荐使用此方法。

**不要将其用于任何其他目的！**

**作者对任何损失概不负责！**

**风险自担！**

## 使用方法

1. 克隆修改过的代码，切换到 `handle_no_reveal` 分支并编译它
    ```
    git clone https://github.com/atlaslabsapp/atomicals-js.git
    cd atomicals-js
    git checkout -b handle_no_reveal origin/handle_no_reveal
    yarn install
    yarn run build
    ```

2. 配置 `.env` 文件中的铸造信息。尽量填写 `important` 下的所有参数。根据不同的参数填写情况，预计完成时间不同：
    - `time` 和 `nonce` 全部正确填写：立即完成（或者等待 reveal bitwork 完成）
    - 只正确填写 `time`：几小时到几天
    - 只正确填写 `nonce`：几秒钟到几分钟
    - `time` 和 `nonce` 全部不填写：几乎不可能成功。推荐在 commit 交易的日志或者 https://www.blockchain.com/explorer/ 上查找`time`的值
    ``` yaml
    #################
    # 恢复配置
    #################
    
    # important （重要配置）
    
    # refund=true: 创建退款交易，当物品铸造已经结束时推荐
    # refund=false: 创建揭示交易，当物品铸造还没有结束时推荐
    refund=false
    # broadcast=true: 像原始版本一样自动广播您的交易
    # broadcast=false: 仅打印原始交易的 hex 值，您可以手动检查并广播它
    broadcast=false
    # commitTxid 是将您的 BTC 发送到看起来不熟悉的地址的交易，必填
    commitTxid=
    # time 和 nonce 是从提交交易发送到的您不熟悉的地址中，提取 BTC 所必需的参数
    # 您可以从控制台日志获取，如 'got one finalCopyData:{"args":{"bitworkc":"000000","bitworkr":"6238",
    #   "mint ticker":"sophon","nonce":7101230,"time":1705506662}}'
    # 如果你使用的没有上述日志的新版软件，配置 nonce=0，time 留空
    time=
    nonce=
    
    # optional（可选配置）
    
    # 当 refund=true 时，退款的 BTC 将被发送到此地址
    # 如果留空，默认为您钱包的 funding 地址
    refundAddress=
    # 为创建的交易设置新的费率。它会覆盖 --satsbyte
    # 如果留空，默认为您命令中的 --satsbyte 参数
    # 您也可以留空并使用 --satsbyte 参数进行更改
    newSatsbyte=
    # 用于构建揭示 p2tr 地址的公钥。
    # 仅适用于高级用户在没有相应钱包 json 文件的情况下运行
    # 如果留空，将从您钱包的 funding 地址计算得出
    childNodeXOnlyPubkey=
    ```

3. 将您的钱包文件复制到 `./wallets/wallet.json`，或在 `.env` 中配置您的钱包文件路径

4. 重新运行您的铸造命令. 推荐添加 `--rbf` 参数以便在某些情况下重新运行本程序来替换交易

5. 如果一切顺利，控制台日志将显示一个原始交易的 hex 值。
    - 请使用诸如 [sparrow](https://sparrowwallet.com/) 或 https://live.blockcypher.com/btc/decodetx/ 的工具来验证交易 hex 是否符合您的需求。
    - 然后在 https://mempool.space/tx/push 手动广播它。
    - 您还可以在 `.env` 中设置 `broadcast=true`，以便程序像原版一样自动广播您的交易，但由于代码尚未完全测试，不建议这样做。


## 捐赠
如果这个特别版本对您有所帮助，欢迎打赏。

- BTC: `bc1pzgt4jhrmky5ve7xvh6vddvft82qwatmxe06r9f9y63yajwgfgg4q23jadt`
- USDT (TRC20): `TXmQ9Z9u776umAeCH5W5rUgMk9rfaL64Fx`

有了像您这样的用户的支持，才使我得以继续我的工作。