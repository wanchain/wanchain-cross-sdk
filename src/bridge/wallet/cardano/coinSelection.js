

const CardanoWasm = require('@emurgo/cardano-serialization-lib-asmjs');
const BigInt = require("big-integer");


class CoinSelection{


  constructor(){

  }



  /**
   * Set protocol parameters required by the algorithm
   * @param {string} coinsPerUtxoWord
   * @param {string} minFeeA
   * @param {string} minFeeB
   * @param {string} maxTxSize
   */
  setProtocolParameters(coinsPerUtxoWord, minFeeA, minFeeB, maxTxSize){
    this.protocolParameters = {
      coinsPerUtxoWord: coinsPerUtxoWord,
      minFeeA: minFeeA,
      minFeeB: minFeeB,
      maxTxSize: maxTxSize,
    };

    console.log("CoinSelection setProtocolParameters finished: ", this.protocolParameters);
  }

  /**
   * Initialise an empty Value with empty MultiAsset
   * @return {Value} - Initialized empty value
   */
  createEmptyValue() {
    const value = CardanoWasm.Value.new(CardanoWasm.BigNum.from_str('0'));
    const multiasset = CardanoWasm.MultiAsset.new();
    value.set_multiasset(multiasset);
    return value;
  }

  /**
   * Compile all required outputs to a flat amounts list
   * @param {TransactionOutputs} outputs - The set of outputs requested for payment.
   * @return {Value} - The compiled set of amounts requested for payment.
   */
  mergeOutputsAmounts(outputs) {
    let compiledAmountList = CardanoWasm.Value.new(
      CardanoWasm.BigNum.from_str('0')
    );

    for (let i = 0; i < outputs.len(); i++) {
      compiledAmountList = this.addAmounts(
        outputs.get(i).amount(),
        compiledAmountList
      );
    }

    return compiledAmountList;
  }


  /**
   * Add up an Amounts List values to another Amounts List
   * @param {Value} amounts - Set of amounts to be added.
   * @param {Value} compiledAmounts - The compiled set of amounts.
   * @return {Value}
   */
  addAmounts(amounts, compiledAmounts) {
    return compiledAmounts.checked_add(amounts);
  }

  /**
   * Narrow down remaining UTxO set in case of native token, use full set for lovelace
   * @param {UTxOSelection} utxoSelection - The set of selected/available inputs.
   * @param {Value} output - Single compiled output qty requested for payment.
   */
  createSubSet(utxoSelection, output) {
    if (BigInt(output.coin().to_str()) < BigInt(1)) {
      console.log("output is less than min value");

      let subset = [];
      let remaining = [];
      for (let i = 0; i < utxoSelection.remaining.length; i++) {
        if (
          this.compare(utxoSelection.remaining[i].output().amount(), output) !==
          undefined
        ) {
          subset.push(utxoSelection.remaining[i]);
        } else {
          remaining.push(utxoSelection.remaining[i]);
        }
      }
      utxoSelection.subset = subset;
      utxoSelection.remaining = remaining;
    } else {
      console.log("output is more than min value");
      utxoSelection.subset = utxoSelection.remaining.splice(
        0,
        utxoSelection.remaining.length
      );
    }
  }

  /**
   * Is Quantity Fulfilled Condition.
   * @param {Value} outputAmount - Single compiled output qty requested for payment.
   * @param {Value} cumulatedAmount - Single compiled accumulated UTxO qty.
   * @param {int} nbFreeUTxO - Number of free UTxO available.
   * @return {boolean}
   */
  isQtyFulfilled(outputAmount, cumulatedAmount, nbFreeUTxO) {
    let amount = outputAmount;
  
    if (!outputAmount.multiasset() || outputAmount.multiasset().len() <= 0) {

      let minRequired =  CardanoWasm.min_ada_required(
        cumulatedAmount,
        CardanoWasm.BigNum.from_str(this.protocolParameters.coinsPerUtxoWord)
      );

      let minAmount = CardanoWasm.Value.new(minRequired);
  
      // Lovelace min amount to cover assets and number of output need to be met
      if (this.compare(cumulatedAmount, minAmount) < 0) {
        console.log("isQtyFulfilled compare false: ", cumulatedAmount, amount);
        return false;
      }

      
  
      // Try covering the max fees
      if (nbFreeUTxO > 0) {
        console.log("isQtyFulfilled nbFreeUTxO: ", nbFreeUTxO);

        let iMinFeeA = BigInt(this.protocolParameters.minFeeA);
        let iMaxSize = BigInt(this.protocolParameters.maxTxSize);
        let iMinFeeB = BigInt(this.protocolParameters.minFeeB);

        let maxFee =  iMinFeeA*iMaxSize + iMinFeeB;
        console.log("isQtyFulfilled maxFee: ", maxFee);
  
        maxFee = CardanoWasm.Value.new(
          CardanoWasm.BigNum.from_str(maxFee.toString())
        );
        console.log("isQtyFulfilled maxFee Value: ", maxFee);
  
        amount = amount.checked_add(maxFee);
      }
    }
  
    console.log("isQtyFulfilled compare: ", cumulatedAmount, amount);
    return this.compare(cumulatedAmount, amount) >= 0;
  }  

  /**
   * Randomly select enough UTxO to fulfill requested outputs
   * @param {UTxOSelection} utxoSelection - The set of selected/available inputs.
   * @param {Value} outputAmount - Single compiled output qty requested for payment.
   * @param {int} limit - A limit on the number of inputs that can be selected.
   * @throws INPUT_LIMIT_EXCEEDED if the number of randomly picked inputs exceed 'limit' parameter.
   * @throws INPUTS_EXHAUSTED if all UTxO doesn't hold enough funds to pay for output.
   * @return {UTxOSelection} - Successful random utxo selection.
   */
  randomSelect(utxoSelection, outputAmount, limit) {
    let nbFreeUTxO = utxoSelection.subset.length;

    // If quantity is met, return subset into remaining list and exit
    if (this.isQtyFulfilled(outputAmount, utxoSelection.amount, nbFreeUTxO)) {

      utxoSelection.remaining = [
        ...utxoSelection.remaining,
        ...utxoSelection.subset,
      ];
      utxoSelection.subset = [];
      return utxoSelection;
    }
  
    if (limit <= 0) {
      throw new Error('INPUT_LIMIT_EXCEEDED');
    }
  
    if (nbFreeUTxO <= 0) {
      throw new Error('INPUTS_EXHAUSTED');
    }
  
    /** @type {TransactionUnspentOutput} utxo */
    let utxo = utxoSelection.subset
      .splice(Math.floor(Math.random() * nbFreeUTxO), 1)
      .pop();
  
    utxoSelection.selection.push(utxo);
    utxoSelection.amount = this.addAmounts(
      utxo.output().amount(),
      utxoSelection.amount
    );
  
    return this.randomSelect(utxoSelection, outputAmount, limit - 1);
  }

  /**
   * Return a deep copy of UTxOSelection
   * @param {UTxOSelection} utxoSelection
   * @return {UTxOSelection} Clone - Deep copy
   */
  cloneUTxOSelection(utxoSelection) {
    return {
      selection: this.cloneUTxOList(utxoSelection.selection),
      remaining: this.cloneUTxOList(utxoSelection.remaining),
      subset: this.cloneUTxOList(utxoSelection.subset),
      amount: this.cloneValue(utxoSelection.amount),
    };
  }

  /**
   * Return a deep copy of an UTxO List
   * @param {UTxOList} utxoList
   * @return {UTxOList} Cone - Deep copy
   */
  cloneUTxOList(utxoList){

    let clonedUtxos = new Array();

    for(let i=0; i<utxoList.length; i++){
      let utxo = utxoList[i];
      let cloneUtxo = CardanoWasm.TransactionUnspentOutput.from_bytes(utxo.to_bytes());
      clonedUtxos.push(cloneUtxo);
    }

    return clonedUtxos;
  }


  /**
   * Return a deep copy of a Value object
   * @param {Value} value
   * @return {Value} Cone - Deep copy
   */
  cloneValue(value){
    let clonedValue = CardanoWasm.Value.from_bytes(value.to_bytes());

    return clonedValue;
  }
  


  /**
   * Use randomSelect & descSelect algorithm to select enough UTxO to fulfill requested outputs
   * @param {UTxOSelection} utxoSelection - The set of selected/available inputs.
   * @param {Value} outputAmount - Single compiled output qty requested for payment.
   * @param {int} limit - A limit on the number of inputs that can be selected.
   * @throws INPUT_LIMIT_EXCEEDED if the number of randomly picked inputs exceed 'limit' parameter.
   * @throws INPUTS_EXHAUSTED if all UTxO doesn't hold enough funds to pay for output.
   * @return {UTxOSelection} - Successful random utxo selection.
   */
  select(utxoSelection, outputAmount, limit) {
    try {
      let clonedSelection = this.cloneUTxOSelection(utxoSelection);

      utxoSelection = this.randomSelect(
        clonedSelection, // Deep copy in case of fallback needed
        outputAmount,
        limit - utxoSelection.selection.length
      );
    } catch (e) {
      if (e.message === 'INPUT_LIMIT_EXCEEDED') {
        // Limit reached : Fallback on DescOrdAlgo
        utxoSelection = this.descSelect(utxoSelection, outputAmount);
      } else {
        throw e;
      }
    }
  
    return utxoSelection;
  }

  /**
   * Select enough UTxO in DESC order to fulfill requested outputs
   * @param {UTxOSelection} utxoSelection - The set of selected/available inputs.
   * @param {Value} outputAmount - Single compiled output qty requested for payment.
   * @throws INPUTS_EXHAUSTED if all UTxO doesn't hold enough funds to pay for output.
   * @return {UTxOSelection} - Successful random utxo selection.
   */
  descSelect(utxoSelection, outputAmount) {
    // Sort UTxO subset in DESC order for required Output unit type
    utxoSelection.subset = utxoSelection.subset.sort((a, b) => {
      return Number(
        this.searchAmountValue(outputAmount, b.output().amount()) -
          this.searchAmountValue(outputAmount, a.output().amount())
      );
    });
  
    do {
      if (utxoSelection.subset.length <= 0) {
        throw new Error('INPUTS_EXHAUSTED');
      }
  
      /** @type {TransactionUnspentOutput} utxo */
      let utxo = utxoSelection.subset.splice(0, 1).pop();
  
      utxoSelection.selection.push(utxo);
      utxoSelection.amount = this.addAmounts(
        utxo.output().amount(),
        utxoSelection.amount
      );
    } while (
      !this.isQtyFulfilled(
        outputAmount,
        utxoSelection.amount,
        utxoSelection.subset.length - 1
      )
    );
  
    // Quantity is met, return subset into remaining list and return selection
    utxoSelection.remaining = [
      ...utxoSelection.remaining,
      ...utxoSelection.subset,
    ];
    utxoSelection.subset = [];
  
    return utxoSelection;
  }

  /**
   * Search & Return CardanoWasm.BigInt amount value
   * @param {Value} needle
   * @param {Value} haystack
   * @return {bigint}
   */
  searchAmountValue(needle, haystack) {    
    let val = BigInt(0);
    let lovelace = BigInt(needle.coin().to_str());
  
    if (lovelace > 0) {
      val = BigInt(haystack.coin().to_str());
    } else if (
      needle.multiasset() &&
      haystack.multiasset() &&
      needle.multiasset().len() > 0 &&
      haystack.multiasset().len() > 0
    ) {
      let scriptHash = needle.multiasset().keys().get(0);
      let assetName = needle.multiasset().get(scriptHash).keys().get(0);
      val = BigInt(haystack.multiasset().get(scriptHash).get(assetName).to_str());
    }
  
    return val;
  }


  /**
   * Random-Improve coin selection algorithm
   * @param {UTxOList} inputs - The set of inputs available for selection.
   * @param {TransactionOutputs} outputs - The set of outputs requested for payment.
   * @param {int} limit - A limit on the number of inputs that can be selected.
   * @return {SelectionResult} - Coin Selection algorithm return
   */
  async randomImprove(inputs, outputs, limit){
    if (!this.protocolParameters)
      throw new Error(
        'Protocol parameters not set. Use setProtocolParameters().'
      );


    /** @type {UTxOSelection} */
    let utxoSelection = {
      selection: [],
      remaining: [...inputs], // Shallow copy
      subset: [],
      amount: this.createEmptyValue(),
    };

    let mergedOutputsAmounts = this.mergeOutputsAmounts(outputs);

    // Explode amount in an array of unique asset amount for comparison's sake
    let splitOutputsAmounts = this.splitAmounts(mergedOutputsAmounts);
    console.log("\n\n******* splitAmounts finish: ");

    // Phase 1: Select enough input
    for (let i = 0; i < splitOutputsAmounts.length; i++) {
      this.createSubSet(utxoSelection, splitOutputsAmounts[i]); // Narrow down for NatToken UTxO

      utxoSelection = this.select(utxoSelection, splitOutputsAmounts[i], limit);
    }
    console.log("\n\n******* select splitOutputsAmounts: ");

    // Phase 2: Improve
    splitOutputsAmounts = this.sortAmountList(splitOutputsAmounts);

    for (let i = 0; i < splitOutputsAmounts.length; i++) {
      this.createSubSet(utxoSelection, splitOutputsAmounts[i]); // Narrow down for NatToken UTxO

      let range = {};
      range.ideal = CardanoWasm.Value.new(
        CardanoWasm.BigNum.from_str('0')
      )
        .checked_add(splitOutputsAmounts[i])
        .checked_add(splitOutputsAmounts[i]);
      range.maximum = CardanoWasm.Value.new(
        CardanoWasm.BigNum.from_str('0')
      )
        .checked_add(range.ideal)
        .checked_add(splitOutputsAmounts[i]);

      this.improve(
        utxoSelection,
        splitOutputsAmounts[i],
        limit - utxoSelection.selection.length,
        range
      );
    }

    // Insure change hold enough Ada to cover included native assets and fees
    if (utxoSelection.remaining.length > 0) {
      const change = utxoSelection.amount.checked_sub(mergedOutputsAmounts);

      let minAmount = CardanoWasm.Value.new(
        CardanoWasm.min_ada_required(
          change, //          false,
          CardanoWasm.BigNum.from_str(this.protocolParameters.coinsPerUtxoWord)
        )
      );

      if (this.compare(change, minAmount) < 0) {
        // Not enough, add missing amount and run select one last time
        const minAda = minAmount
          .checked_sub(CardanoWasm.Value.new(change.coin()))
          .checked_add(CardanoWasm.Value.new(utxoSelection.amount.coin()));

        this.createSubSet(utxoSelection, minAda);
        utxoSelection = this.select(utxoSelection, minAda, limit);
      }
    }


    return {
      input: utxoSelection.selection,
      output: outputs,
      remaining: utxoSelection.remaining,
      amount: utxoSelection.amount,
      change: utxoSelection.amount.checked_sub(mergedOutputsAmounts),
    };
  }

  /**
   * Try to improve selection by increasing input amount in [2x,3x] range.
   * @param {UTxOSelection} utxoSelection - The set of selected/available inputs.
   * @param {Value} outputAmount - Single compiled output qty requested for payment.
   * @param {int} limit - A limit on the number of inputs that can be selected.
   * @param {ImproveRange} range - Improvement range target values
   */
  improve(utxoSelection, outputAmount, limit, range) {
    let nbFreeUTxO = utxoSelection.subset.length;
  
    if (
      this.compare(utxoSelection.amount, range.ideal) >= 0 ||
      nbFreeUTxO <= 0 ||
      limit <= 0
    ) {
      // Return subset in remaining
      utxoSelection.remaining = [
        ...utxoSelection.remaining,
        ...utxoSelection.subset,
      ];
      utxoSelection.subset = [];
  
      return;
    }
  
    /** @type {TransactionUnspentOutput} utxo */
    const utxo = utxoSelection.subset
      .splice(Math.floor(Math.random() * nbFreeUTxO), 1)
      .pop();
  
    const newAmount = CardanoWasm.Value.new(
      CardanoWasm.BigNum.from_str('0')
    )
      .checked_add(utxo.output().amount())
      .checked_add(outputAmount);
  
    if (
      this.abs(this.getAmountValue(range.ideal) - this.getAmountValue(newAmount)) <
        this.abs(this.getAmountValue(range.ideal) - this.getAmountValue(outputAmount)) &&
      this.compare(newAmount, range.maximum) <= 0
    ) {
      utxoSelection.selection.push(utxo);
      utxoSelection.amount = this.addAmounts(
        utxo.output().amount(),
        utxoSelection.amount
      );
      limit--;
    } else {
      utxoSelection.remaining.push(utxo);
    }
  
    return this.improve(utxoSelection, outputAmount, limit, range);
  }


  abs(big) {
    return big < 0 ? big * BigInt(-1) : big;
  }


  /**
   * Compare a candidate value to the one in a group if present
   * @param {Value} group
   * @param {Value} candidate
   * @return {int} - -1 group lower, 0 equal, 1 group higher, undefined if no match
   */
  compare(group, candidate) {
    let gQty = BigInt(group.coin().to_str());
    let cQty = BigInt(candidate.coin().to_str());

    if (candidate.multiasset() && candidate.multiasset().len() > 0) {
      let cScriptHash = candidate.multiasset().keys().get(0);
      let cAssetName = candidate.multiasset().get(cScriptHash).keys().get(0);

      if (group.multiasset() && group.multiasset().len()) {
        if (
          group.multiasset().get(cScriptHash) &&
          group.multiasset().get(cScriptHash).get(cAssetName)
        ) {
          gQty = BigInt(
            group.multiasset().get(cScriptHash).get(cAssetName).to_str()
          );
          cQty = BigInt(
            candidate.multiasset().get(cScriptHash).get(cAssetName).to_str()
          );
        } else {
          return undefined;
        }
      } else {
        return undefined;
      }
    }

    return gQty >= cQty ? (gQty === cQty ? 0 : 1) : -1;
  }


  /**
   * Split amounts contained in a single {Value} object in separate {Value} objects
   * @param {Value} amounts - Set of amounts to be split.
   * @return {AmountList}
   */
  splitAmounts(amounts) {
    let splitAmounts = [];

    if (amounts.multiasset() && amounts.multiasset().len() > 0) {
      let mA = amounts.multiasset();

      for (let i = 0; i < mA.keys().len(); i++) {
        let scriptHash = mA.keys().get(i);

        for (let j = 0; j < mA.get(scriptHash).keys().len(); j++) {
          let _assets = CardanoWasm.Assets.new();
          let assetName = mA.get(scriptHash).keys().get(j);

          _assets.insert(
            CardanoWasm.AssetName.from_bytes(assetName.to_bytes()),
            CardanoWasm.BigNum.from_bytes(
              mA.get(scriptHash).get(assetName).to_bytes()
            )
          );

          let _multiasset = CardanoWasm.MultiAsset.new();
          _multiasset.insert(
            CardanoWasm.ScriptHash.from_bytes(scriptHash.to_bytes()),
            _assets
          );
          let _value = CardanoWasm.Value.new(
            CardanoWasm.BigNum.from_str('0')
          );
          _value.set_multiasset(_multiasset);

          splitAmounts.push(_value);
        }
      }
    }

    // Order assets by qty DESC
    splitAmounts = this.sortAmountList(splitAmounts, 'DESC');

    // Insure lovelace is last to account for min ada requirement
    splitAmounts.push(
      CardanoWasm.Value.new(
        CardanoWasm.BigNum.from_bytes(amounts.coin().to_bytes())
      )
    );

    return splitAmounts;
  }



  /**
   * Sort a mismatched AmountList ASC/DESC
   * @param {AmountList} amountList - Set of mismatched amounts to be sorted.
   * @param {string} [sortOrder=ASC] - Order
   * @return {AmountList} - The sorted AmountList
   */
  sortAmountList(amountList, sortOrder = 'ASC') {
    return amountList.sort((a, b) => {
      let sortInt = sortOrder === 'DESC' ? BigInt(-1) : BigInt(1);
      return Number((this.getAmountValue(a) - this.getAmountValue(b)) * sortInt);
    });
  }

  /**
   * Return CardanoWasm.BigInt amount value
   * @param {Value} amount
   * @return {bigint}
   */
  getAmountValue(amount) {
    let val = BigInt(0);
    let lovelace = BigInt(amount.coin().to_str());
  
    if (lovelace > 0) {
      val = lovelace;
    } else if (amount.multiasset() && amount.multiasset().len() > 0) {
      let scriptHash = amount.multiasset().keys().get(0);
      let assetName = amount.multiasset().get(scriptHash).keys().get(0);
      val = BigInt(amount.multiasset().get(scriptHash).get(assetName).to_str());
    }
  
    return val;
  }


}


module.exports = CoinSelection;
