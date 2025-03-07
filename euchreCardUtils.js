/**
 * Euchre Card Utilities
 * Contains functions for card manipulation, comparison, and determining card properties
 */

// Check if two suits are the same color
function isSameColor(suit1, suit2) {
    const redSuits = ['hearts', 'diamonds'];
    const blackSuits = ['clubs', 'spades'];
    
    return (redSuits.includes(suit1) && redSuits.includes(suit2)) || 
           (blackSuits.includes(suit1) && blackSuits.includes(suit2));
  }
  
  // Get the left bower suit based on trump suit
  function getLeftBowerSuit(trumpSuit) {
    switch (trumpSuit) {
      case 'hearts': return 'diamonds';
      case 'diamonds': return 'hearts';
      case 'clubs': return 'spades';
      case 'spades': return 'clubs';
      default: return null;
    }
  }
  
  // Get the effective suit of a card (accounting for bowers)
  function getEffectiveSuit(card, trumpSuit) {
    // Left bower (Jack of same color suit) counts as trump
    if (card.rank === 'J' && isSameColor(card.suit, trumpSuit) && card.suit !== trumpSuit) {
      return trumpSuit;
    }
    return card.suit;
  }
  
  // Get card value for comparison and trick winning
  function getCardValue(card, trumpSuit) {
    if (!card || !trumpSuit) return 0;
    
    const suit = card.suit;
    const rank = card.rank;
    
    // Base card values (higher = stronger)
    const rankValues = {
      '9': 9,
      '10': 10,
      'J': 11,
      'Q': 12,
      'K': 13,
      'A': 14
    };
    
    // Get effective suit (accounting for left bower)
    const effectiveSuit = getEffectiveSuit(card, trumpSuit);
    
    // Right bower is highest
    if (rank === 'J' && suit === trumpSuit) {
      return 100; // Right bower
    }
    
    // Left bower is second highest
    if (rank === 'J' && effectiveSuit === trumpSuit && suit !== trumpSuit) {
      return 99; // Left bower
    }
    
    // Trump cards are higher than non-trump
    if (effectiveSuit === trumpSuit) {
      return rankValues[rank] + 50; // Trump bonus
    }
    
    // Regular card
    return rankValues[rank];
  }
  
  // Compare two cards to see which is higher
  function compareCards(card1, card2, leadSuit, trumpSuit) {
    const suit1 = getEffectiveSuit(card1, trumpSuit);
    const suit2 = getEffectiveSuit(card2, trumpSuit);
    
    // Trump beats non-trump
    if (suit1 === trumpSuit && suit2 !== trumpSuit) {
      return 1;
    }
    if (suit1 !== trumpSuit && suit2 === trumpSuit) {
      return -1;
    }
    
    // If both trump, compare ranks (special ordering)
    if (suit1 === trumpSuit && suit2 === trumpSuit) {
      return compareTrumpRanks(card1, card2, trumpSuit);
    }
    
    // If neither trump, following lead suit beats not following
    if (suit1 === leadSuit && suit2 !== leadSuit) {
      return 1;
    }
    if (suit1 !== leadSuit && suit2 === leadSuit) {
      return -1;
    }
    
    // Otherwise compare by rank within the same suit
    return compareCardRanks(card1, card2, trumpSuit);
  }
  
  // Compare ranks for the special case of trump cards
  function compareTrumpRanks(card1, card2, trumpSuit) {
    // Right bower (Jack of trump suit)
    const isRightBower1 = card1.rank === 'J' && card1.suit === trumpSuit;
    const isRightBower2 = card2.rank === 'J' && card2.suit === trumpSuit;
    
    if (isRightBower1 && !isRightBower2) return 1;
    if (!isRightBower1 && isRightBower2) return -1;
    if (isRightBower1 && isRightBower2) return 0; // Should never happen in practice
    
    // Left bower (Jack of same color suit)
    const leftBowerSuit = getLeftBowerSuit(trumpSuit);
    const isLeftBower1 = card1.rank === 'J' && card1.suit === leftBowerSuit;
    const isLeftBower2 = card2.rank === 'J' && card2.suit === leftBowerSuit;
    
    if (isLeftBower1 && !isLeftBower2) return 1;
    if (!isLeftBower1 && isLeftBower2) return -1;
    if (isLeftBower1 && isLeftBower2) return 0; // Should never happen
    
    // Normal rank comparison for other trump cards
    return compareCardRanks(card1, card2, trumpSuit);
  }
  
  // Compare regular card ranks
  function compareCardRanks(card1, card2, trumpSuit) {
    const rankValues = {'9': 0, '10': 1, 'J': 2, 'Q': 3, 'K': 4, 'A': 5};
    return rankValues[card1.rank] - rankValues[card2.rank];
  }
  
  // Get numeric rank value for sorting
  function getCardRankValue(card, trumpSuit) {
    const rankValues = {'9': 0, '10': 1, 'J': 2, 'Q': 3, 'K': 4, 'A': 5};
    
    // Special case for bowers
    if (card.rank === 'J') {
      if (card.suit === trumpSuit) {
        return 100; // Right bower is highest
      }
      if (card.suit === getLeftBowerSuit(trumpSuit)) {
        return 99; // Left bower is second highest
      }
    }
    
    return rankValues[card.rank];
  }
  
  // Find the lowest card in a hand (utility for CPU)
  function findLowestCard(hand, trumpSuit) {
    let lowestIndex = 0;
    let lowestValue = Number.MAX_SAFE_INTEGER;
    
    hand.forEach((card, index) => {
      const value = getCardValue(card, trumpSuit);
      if (value < lowestValue) {
        lowestValue = value;
        lowestIndex = index;
      }
    });
    
    return lowestIndex;
  }
  
  module.exports = {
    isSameColor,
    getLeftBowerSuit,
    getEffectiveSuit,
    getCardValue,
    compareCards,
    compareTrumpRanks,
    compareCardRanks,
    getCardRankValue,
    findLowestCard
  };