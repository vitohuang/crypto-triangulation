const _ = require('lodash');
const math = require('mathjs');

const COIN_DECIMAL = 5;
const FIAT_DECIMAL = 2;
const FIAT = ['USD', 'GBP', 'EUR'];
const PAIR_DELIMITER = '-';

function formatCurrency(currency, value) {
  if (value) {
    // Format the fiat currency
    let decimal = COIN_DECIMAL;
    if (FIAT.indexOf(currency) !== -1) {
      // If its fiat currency
      decimal = FIAT_DECIMAL;
    } else if (FIAT.indexOf(currency.split(PAIR_DELIMITER)[1]) !== -1) {
      // if the fiat is in the pair
      decimal = FIAT_DECIMAL;
    }

    return math.round(value, decimal);
  } else {
    return 0;
  }
}

function formatCurrencyFromSide(side, pair, value) {
  if (value) {
    // Split the pair
    let pairParts = pair.split(PAIR_DELIMITER);
    let symbol ='';
    if (side === 'buy') {
      symbol = pairParts[0];
    } else {
      symbol = pairParts[0];
    }

    // Check if the symbol is fiat currency or not
    let decimal = COIN_DECIMAL;
    if (FIAT.indexOf(symbol) !== -1) {
      // If its fiat currency
      decimal = FIAT_DECIMAL;
    }

    return math.round(value, decimal);
  } else {
    return 0;
  }
}

module.exports = {
  formatCurrency,
  formatCurrencyFromSide,
};
