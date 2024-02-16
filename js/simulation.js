/**
 * Let users define their own helper functions
 */
const GUEST_NAME_FIRST = ['John', 'Jane', 'Bob', 'Alice', 'Charlie', 'Eve', 'David', 'Sarah', 'Michael', 'Emily', 'Mohammed', 'Maria', 'Chen', 'Yuki', 'Sofia', 'Liam', 'Olivia', 'Noah', 'Emma', 'Ava'];
const GUEST_NAME_LAST = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Kim', 'Lee', 'Chen', 'Wang', 'Liu', 'Singh', 'Kumar', 'Gupta', 'Ali', 'Khan'];

function generateRandomHumanName() {
  const firstName = GUEST_NAME_FIRST[Math.floor(context.random() * GUEST_NAME_FIRST.length)];
  const lastName = GUEST_NAME_LAST[Math.floor(context.random() * GUEST_NAME_LAST.length)];

  return `${firstName} ${lastName}`;
}

function trySpendMoney(amount) {
  const parkMoney = context.global.getParameter('parkMoney');
  if (parkMoney.getValue() < amount) {
    return false;
  }

  parkMoney.setValue(parkMoney.getValue() - amount);
  return true;
}

function changeParkRating(amount) {
  const parkRating = context.global.getParameter('parkRating');
  parkRating.setValue(parkRating.getValue() + amount);
}

function createEntity({ name, category, currentState, parameters }) {
  const entity = new Entity({
    name,
    category,
    parameters: parameters || [],
    currentState
  });
  entities.push(entity);

  return entity;
}

function createGuest({ name, currentState, parameters }) {
  return createEntity({
    name,
    category: CATEGORY_GUEST,
    parameters: parameters || [],
    currentState
  });
}

function removeGuest(guest) {
  removeEntity(entities, guest);
}

// Helper function to get staff that can repair rides
// If they're ready for a job move them to the front of the list
function getRepairStaff() {
  const staff = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];

    if (entity.category !== CATEGORY_STAFF) {
      continue;
    }

    if (entity.getParameter('canRepairRides').getValue()) {
      if (entity.getState().is('working-standby')) {
        staff.unshift(entity);
      } else {
        staff.push(entity);
      }
    }
  }

  return staff;
}

// Find a shop that supplies a product that canReduceHunger
function findFoodShop() {
  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];

    if (entity.category !== CATEGORY_SHOP) {
      continue;
    }

    const inventory = entity.$get('inventory', []);

    for (let j = 0; j < inventory.length; j++) {
      const product = inventory[j];

      if (product.getParameter('canReduceHunger').getValue()) {
        return entity;
      }
    }
  }
}

/**
 * 
 * Park parameters and states
 * 
 */
const PARAMETER_PARK_EXCITEMENT_FACTOR = new ParameterType({
  name: 'parkExcitementFactor',
  isGloballyAccessible: true,
  customToString: (value, originalValue) => `😄 ${value.toFixed(4)}`,
});

const PARAMETER_PARK_MONEY = new ParameterType({
  name: 'parkMoney',
  isGloballyAccessible: true,
  customToString: (value, originalValue) => value < 0 ? `<span class="red">$${value.toFixed(2)}</span>` : `$${value.toFixed(2)}`,
});

const PARAMETER_PARK_RATING = new ParameterType({
  name: 'parkRating',
  isGloballyAccessible: true,
  clampFunction: (value) => Math.max(0, Math.min(1000, value)),
  customToString: (value, originalValue) => `${value.toFixed(0)}`,
});

const PARAMETER_PARK_TAXES = new ParameterType({
  name: 'parkTaxes',
  customToString: (value, originalValue) => `$${value.toFixed(2)} / day`,
});

const STATE_PARK_OPEN = new EntityState({
  typeName: 'open',
  onUpdate: function (entity) {
    // One off experiment sandboxing
    sandbox.run(/* javascript */`
      
      // Set the park increase parameter based on attraction capacity and park rating
      var parkRatingFactor = getGlobalParameter('parkRating')  / 1000;
      var rides = findEntitiesByCategoryName('Rides');
      var rideCount = countEntities(rides);
      var attractionCapacity = sumEntitiesByParameter(rides, 'guestCapacity');
      var parkGuestCount = countEntities(findEntitiesByCategoryName('Guests'));

      attractionCapacity = attractionCapacity * 1.5;
      var maxIncrease = Math.min(10, Math.floor(attractionCapacity / 10));
      var parkGuestIncreaseFromAds = entity$get('parkGuestIncreaseFromAds', 0);
      entity$set('parkGuestIncreaseFromAds', Math.max(0, parkGuestIncreaseFromAds - 1));
      var increase = Math.round(Math.min(10, (attractionCapacity - parkGuestCount) * parkRatingFactor)) + parkGuestIncreaseFromAds;
      entity$set('parkGuestCountIncrease', increase);

      for (var i = 0; i < increase; i++) {
        createGuest(
          generateRandomHumanName(),
          STATE_GUEST_ENTERING_PARK,
          newParameter('happiness', 0.5),
          newParameter('money', 50 + Math.floor(random() * 100)),
          newParameter('hunger', random() * 0.5),
          newParameter('expectedRideCount', Math.round(random() * (rideCount / 2) + 1))
        );
      }

      var MINUTES_IN_DAY = 1440;
      if (getCurrentTime() % MINUTES_IN_DAY === 0) {
        var parkMoney = entityGetParameter('parkMoney');
        var parkTaxes = entityGetParameter('parkTaxes');
        parkMoney = parkMoney - parkTaxes;

        createLog('💰 Paid park daily taxes: $' + parkTaxes, true);

        var totalWages = sumEntitiesByParameter(findEntitiesByCategoryName('Staff'), 'wagePerDay');
        parkMoney = parkMoney - totalWages;
        entitySetParameter('parkMoney', parkMoney);

        createLog('💰 Paid staff wages totalling: $' + totalWages, true);
      }
    `, {
      entity$get: (key, defaultValue) => entity.$get(key, defaultValue),
      entity$set: (key, value) => entity.$set(key, value),

      entityGetParameter: (parameterName) => entity.getParameter(parameterName).getValue(),
      entitySetParameter: (parameterName, value) => entity.getParameter(parameterName).setValue(value),

      generateRandomHumanName,
    });
  },
});

/**
 * 
 * Guest parameters and states
 * 
 */
const PARAMETER_GUEST_EXPECTED_RIDE_COUNT = new ParameterType({
  name: 'expectedRideCount',
  customToString: (value, originalValue) => value.toFixed(0),
});

const PARAMETER_GUEST_HAPPINESS = new ParameterType({
  name: 'happiness',
  clampFunction: (value) => Math.max(0, Math.min(1, value)),
  customToString: (value, originalValue) => value.toFixed(2),
});

const PARAMETER_GUEST_HUNGER = new ParameterType({
  name: 'hunger',
  clampFunction: (value) => Math.max(0, Math.min(1, value)),
  customToString: (value, originalValue) => value.toFixed(2),
});

const PARAMETER_GUEST_MONEY = new ParameterType({
  name: 'money',
  customToString: (value, originalValue) => `$${value.toFixed(2)}`,
});

const STATE_GUEST_ENTERING_PARK = new EntityState({
  typeName: 'entering-park',
  onEnter: function (entity, previousState) {
    createLog(`👋 ${entity.name} started roaming through the park.`);

    return STATE_GUEST_ROAMING;
  },
});

const STATE_GUEST_ROAMING = new EntityState({
  typeName: 'roaming',
  onUpdate: function (entity) {
    const moneyParameter = entity.getParameter('money');
    const rides = entities.filter(e => e.category === CATEGORY_RIDE);
    const rideIndexOrInvalid = Math.floor(context.random() * rides.length);
    const happinessParameter = entity.getParameter('happiness');
    let happiness = happinessParameter.getValue();

    // Increase hunger and try find a shop if we're hungry
    const hungerParameter = entity.getParameter('hunger');
    const newHungryValue = hungerParameter.getValue() + 0.01; // TODO: Make this a parameter based on time of day, character, etc.
    hungerParameter.setValue(newHungryValue);

    if (newHungryValue > 0.7) {
      const shop = findFoodShop();

      if (!shop) {
        happiness = happiness * 0.9;
        happinessParameter.setValue(happiness);

        createLog(`😞 ${entity.name} is hungry but can't find a shop to eat at (happiness: ${happiness.toFixed(2)})`, true);
      } else {
        // Buy food
        const inventory = shop.$get('inventory', []);
        const foodProducts = inventory.filter(p => p.getParameter('canReduceHunger').getValue());

        if (foodProducts.length === 0) {
          throw new Error('Shop has no food products (what happened since we called findFoodShop?)');
        }

        const foodProduct = foodProducts[0];
        const price = foodProduct.getParameter('price').getValue();

        if (moneyParameter.getValue() < price) {
          createLog(`🤑 ${entity.name} can't afford food at ${shop.name} (needs $${price})`);
          happiness = happiness * 0.9;
          happinessParameter.setValue(happiness);
          changeParkRating(-0.05);
        } else {
          moneyParameter.setValue(moneyParameter.getValue() - price);
          hungerParameter.setValue(newHungryValue / 4); // TODO: Make this a parameter based on food product

          happiness = happiness * 1.1;
          happinessParameter.setValue(happiness);

          // Adjust stock
          removeEntity(inventory, foodProduct);

          createLog(`🍔 ${entity.name} buys food at ${shop.name} for $${price}`);
          changeParkRating(0.1);

          // Have the shop restock the food
          // TODO: Have this threshold be a parameter
          if (inventory.length === 0) {
            shop.setState(STATE_SHOP_RESTOCKING);
          }
        }
      }
    }

    // Leave if we've reached our expected ride count
    const expectedRideCount = entity.getParameter('expectedRideCount').getValue();

    if (entity.$get('ridesRidden', 0) >= expectedRideCount) {
      removeGuest(entity);
      createLog(`👋 ${entity.name} leaves the park with fond memories, after riding ${expectedRideCount} rides.`);

      return;
    }

    // Count how many times we've got a happiness below a threshold, if it's a bunch of times, leave the park
    if (happiness < 0.2) {
      const lowHappinessCount = entity.$get('lowHappinessCount', 0);

      if (lowHappinessCount < 5) {
        entity.$set('lowHappinessCount', lowHappinessCount + 1);
        createLog(`😞 ${entity.name} is unhappy (lowHappinessCount: ${lowHappinessCount + 1})`);
      } else {
        removeGuest(entity);
        createLog(`👋 ${entity.name} leaves the park after being unhappy for a while.`, true);
        changeParkRating(-1);

        return;
      }
    } else {
      entity.$set('lowHappinessCount', 0);
    }

    if (rideIndexOrInvalid < rides.length) {
      const ride = rides[rideIndexOrInvalid];

      // Check that the guest can afford the ride
      const entryFee = ride.getParameter('entryFee').getValue();

      if (moneyParameter.getValue() < entryFee) {
        // Keep track of the fact we can't afford the ride
        const expensiveRideCount = entity.$get('expensiveRideCount', 0);

        if (expensiveRideCount < 5) {
          entity.$set('expensiveRideCount', expensiveRideCount + 1);
          createLog(`🤑 ${entity.name} can't afford ${ride.name} (expensiveRideCount: ${expensiveRideCount + 1})`);
        } else {
          removeGuest(entity);
          createLog(`👋 ${entity.name} leaves the park after not being able to afford a rides or products.`, true);
          changeParkRating(-0.1); // TODO: What can the player do? Perhaps add ATM's?
        }

        return;
      }

      const guestsInLine = ride.$get('guestsInLine', []);
      entity.$set('ride', ride);
      guestsInLine.push(entity);

      createLog(`👫 ${entity.name} joins the line for ${ride.name}`);
      return STATE_GUEST_IN_LINE;
    }
  },
});

const STATE_GUEST_IN_LINE = new EntityState({
  typeName: 'in line for ride',
  // Reduce happiness while in line
  onUpdate: function (entity) {
    const ride = entity.$get('ride', null);
    const happiness = entity.getParameter('happiness');
    happiness.setValue(happiness.getValue() * 0.999);

    // When in line we get hungrier
    const hungerParameter = entity.getParameter('hunger');
    const newHungryValue = hungerParameter.getValue() + 0.02; // TODO: Make this a parameter based on time of day, character, etc.
    hungerParameter.setValue(newHungryValue);

    // Count times we've reduced happiness in line, if we hit a threshold, leave the line
    const lowLineHappinessCount = entity.$get('lowLineHappinessCount', 0);

    // TODO: Make a parameter in park?
    const maxMinutesInLine = ride.getParameter('rideTime').getValue() * 3;

    if (lowLineHappinessCount < maxMinutesInLine) {
      createLog(`😞 ${entity.name} is waiting in line for a ride (happiness: ${happiness.getValue().toFixed(2)})`);
      entity.$set('lowLineHappinessCount', lowLineHappinessCount + 1);
    } else {
      const guestsInLine = ride.$get('guestsInLine', []);
      removeEntity(guestsInLine, entity);

      entity.setState(STATE_GUEST_ROAMING);
      entity.$unset('ride');
      entity.$unset('entryFee');
      entity.$set('lowLineHappinessCount', 0);

      createLog(`👋 ${entity.name} leaves the line for ${ride.name} after waiting too long.`);
      changeParkRating(-1);
    }
  },
});

const STATE_GUEST_ON_RIDE = new EntityState({
  typeName: 'on ride',
  onEnter: function (entity, previousState) {
    entity.$set('lowLineHappinessCount', 0);
  },
  onExit: function (entity, nextState) {
    entity.$set('ridesRidden', entity.$get('ridesRidden', 0) + 1);
  },
  // Increase happiness while on the ride, based on the ride's excitement
  onUpdate: function (entity) {
    const ride = entity.$get('ride', null);
    const entryFeePaid = entity.$get('entryFee', 0);

    if (ride.getState().is('broken-down')) {
      const happiness = entity.getParameter('happiness');
      happiness.setValue(happiness.getValue() * 0.99);

      // TODO: How do guests get off a broken ride?
      // const lowHappinessCount = entity.$get('lowHappinessCount', 0);
      // if (lowHappinessCount < 5) {
      //   entity.$set('lowHappinessCount', lowHappinessCount + 1);
      //   createLog(`😞 ${entity.name} is on a broken down ride (lowHappinessCount: ${lowHappinessCount + 1})`);
      // } else {
      //   removeGuest(entity);
      //   createLog(`👋 ${entity.name} leaves the park after being on a broken down ride for a while.`, true);
      //   changeParkRating(-1);
      // }

      return;
    }
    const excitement = ride.getParameter('excitement').getValue();
    const increase = (excitement / (entryFeePaid + 1)) * context.global.getParameter('parkExcitementFactor').getValue();

    const happiness = entity.getParameter('happiness');
    happiness.setValue(happiness.getValue() + increase);

    createLog(`😄 ${entity.name} is on ${ride.name} (happiness: ${happiness.getValue().toFixed(2)})`);
    changeParkRating(1 * increase);
  },
});

/**
 * 
 * Ride parameters and states
 * 
 */
const PARAMETER_RIDE_EXCITEMENT = new ParameterType({
  name: 'excitement',
  customToString: (value, originalValue) => value.toFixed(2),
});

const PARAMETER_RIDE_RELIABILITY = new ParameterType({
  name: 'reliability',
  customToString: (value, originalValue) => value.toFixed(2),
});

const PARAMETER_RIDE_ENTRY_FEE = new ParameterType({
  name: 'entryFee',
  customToString: (value, originalValue) => `$${value.toFixed(2)}`,
});

const PARAMETER_RIDE_TIME = new ParameterType({
  name: 'rideTime',
  customToString: (value, originalValue) => `${value}m`,
});

const PARAMETER_RIDE_GUEST_CAPACITY = new ParameterType({
  name: 'guestCapacity',
  isGloballyAccessible: true,
  customToString: (value, originalValue) => `${value} guests`,
});

const STATE_RIDE_OPERATING_BOARDING = new EntityState({
  typeName: 'operating-boarding',
  onUpdate: function (entity) {
    // If there's a line and we've got room, let guests on
    const guestCapacity = entity.getParameter('guestCapacity').getValue();

    const guestsOnRide = entity.$get('guestsOnRide', []);
    const guestsInLine = entity.$get('guestsInLine', []);

    while (guestsOnRide.length < guestCapacity && guestsInLine.length > 0) {
      const guest = guestsInLine.shift();

      // Check that the guest can afford the ride and take it
      const entryFee = entity.getParameter('entryFee').getValue();
      const moneyParameter = guest.getParameter('money');

      if (moneyParameter.getValue() < entryFee) {
        // TODO: Leave the line
        console.error(`Guest ${guest.name} doesn't have enough money to ride ${entity.name} (what happened while in line?)`);
        return;
      }

      moneyParameter.setValue(moneyParameter.getValue() - entryFee);

      guestsOnRide.push(guest);
      guest.setState(STATE_GUEST_ON_RIDE);
      guest.$set('ride', entity);
      guest.$set('entryFee', entryFee);

      const parkMoneyParameter = context.global.getParameter('parkMoney');
      parkMoneyParameter.setValue(parkMoneyParameter.getValue() + entryFee);

      createLog(`👫 ${guest.name} boards ${entity.name} (paid $${entryFee})`);
    }

    // If we're half full, start the ride
    // TODO: Make this configurable
    if (guestsOnRide.length >= guestCapacity / 2) {
      createLog(`🎢 ${entity.name} is starting ride`);

      return STATE_RIDE_OPERATING_ACTIVE;
    }
  },
});

const STATE_RIDE_OPERATING_ACTIVE = new EntityState({
  typeName: 'operating-active',
  onUpdate: function (entity) {
    const rideTime = entity.getParameter('rideTime').getValue();

    const rideTimeCurrent = entity.$get('rideTimeCurrent', 0);

    if (rideTimeCurrent >= rideTime) {
      // Ride is over. Return to boarding state
      createLog(`🎢 ${entity.name} is ending ride`);
      entity.$set('rideTimeCurrent', 0);

      const guestsOnRide = entity.$get('guestsOnRide', []);

      // Clear the guests from the ride
      while (guestsOnRide.length > 0) {
        const guest = guestsOnRide.shift();
        guest.setState(STATE_GUEST_ROAMING);
        guest.$unset('ride');
        guest.$unset('entryFee');

        createLog(`👫 ${guest.name} leaves ${entity.name}`);
      }

      return STATE_RIDE_OPERATING_BOARDING;
    } else {
      entity.$set('rideTimeCurrent', rideTimeCurrent + 1);
    }

    // Wear and tear on the ride
    const reliabilityParameter = entity.getParameter('reliability');
    const reliability = reliabilityParameter.getValue();

    // https://www.desmos.com/calculator/wqriue4sle
    function isBrokenDown(randomNumber, reliability, rate = 10) {
      const chanceToNotBreakdown = 1 - Math.pow(2, -rate * reliability);
      return randomNumber > chanceToNotBreakdown;
    }

    // Lets only check every 10 minutes
    if (context.currentTime % 10 === 0) {
      if (reliability < 0.8 && isBrokenDown(context.random(), reliability)) {
        createLog(`💥 ${entity.name} has broken down (reliability: ${reliability.toFixed(2)})`, true);
        return STATE_RIDE_BROKEN_DOWN;
      }
    }

    reliabilityParameter.setValue(reliability * 0.999);
  },
});

const STATE_RIDE_BROKEN_DOWN = new EntityState({
  typeName: 'broken-down',
  onEnter: function (entity, previousState) {
    const staff = getRepairStaff();

    if (staff.length === 0) {
      createLog(`🔧 ${entity.name} is broken down and there's no staff to fix it`, true);
      // TODO: Have newly hired staff come check out if any rides are broken down
      return;
    }

    const mechanic = staff[0];
    const tasks = mechanic.$get('tasks', []);
    tasks.push({
      ride: entity,
      isBrokenDown: true,
    });
  }
});

const STATE_RIDE_UNDER_MAINTENANCE = new EntityState({
  typeName: 'under-maintenance',
  onEnter: function (entity, previousState) {
    // TODO: Have all guests in line and on the ride be disappointed
    // TODO: Have some guets leave the line
  },
});

/**
 * 
 * Staff parameters and states
 * 
 */
const PARAMETER_STAFF_HAPPINESS = new ParameterType({
  name: 'happiness',
  clampFunction: (value) => Math.max(0, Math.min(1, value)),
  customToString: (value, originalValue) => value.toFixed(2),
});

const PARAMETER_STAFF_WAGE = new ParameterType({
  name: 'wagePerDay',
  customToString: (value, originalValue) => `$${value.toFixed(2)}`,
});

const PARAMETER_STAFF_CAN_REPAIR_RIDES = new ParameterType({
  name: 'canRepairRides',
  customToString: (value, originalValue) => value ? 'Yes' : 'No',
});

// On break, off time, not to be disturbed
const STATE_STAFF_OFF_TIME = new EntityState({
  typeName: 'off-time',
});

// Working, but not currently doing anything
const STATE_STAFF_WORKING_STANDBY = new EntityState({
  typeName: 'working-standby',
  onUpdate: function (entity) {
    const canRepairRides = entity.getParameter('canRepairRides').getValue();

    if (!canRepairRides) {
      // TODO: Janitor logic
      return;
    }

    // Check list of called in defects
    const tasks = entity.$get('tasks', []);

    if (tasks.length === 0) {
      // See if there is any rides that could use a checkup (based on reliability)
      for (let i = 0; i < entities.length; i++) {
        if (entities[i].category !== CATEGORY_RIDE) {
          continue;
        }

        const ride = entities[i];
        const reliability = ride.getParameter('reliability').getValue();

        if (reliability < 0.6) {
          tasks.push({
            ride,
            isBrokenDown: false,
          });
          break;
        }
      }

      return;
    }

    const task = tasks.shift();
    const ride = task.ride;
    ride.setState(STATE_RIDE_UNDER_MAINTENANCE);

    // calculate effectiveness of the mechanic based on happiness
    const happiness = entity.getParameter('happiness').getValue();
    const effectiveness = happiness * 0.5 + 0.5;

    entity.$set('currentTask', {
      ride,
      finishAt: context.currentTime + (20 * (1 - effectiveness)),
    });

    if (task.isBrokenDown) {
      createLog(`🔧 ${entity.name} is repairing ${ride.name} (effectiveness: ${effectiveness})`, true);
    } else {
      createLog(`🔧 ${entity.name} is maintaining ${ride.name} (effectiveness: ${effectiveness})`, true);
    }

    return STATE_STAFF_WORKING_ACTIVE;
  },
});

// Working, currently doing something
const STATE_STAFF_WORKING_ACTIVE = new EntityState({
  typeName: 'working-active',
  onUpdate: function (entity) {
    const currentTask = entity.$get('currentTask');

    if (currentTask.finishAt <= context.currentTime) {
      const ride = currentTask.ride;
      const reliabilityParameter = ride.getParameter('reliability');
      reliabilityParameter.setValue(1);
      ride.setState(STATE_RIDE_OPERATING_ACTIVE);

      entity.$unset('currentTask');
      createLog(`🔧 ${entity.name} has finished repairing ${ride.name}`);

      return STATE_STAFF_WORKING_STANDBY;
    }
  },
});

/**
 * 
 * Shop parameters and states
 * 
 */
const PARAMETER_SHOP_PRODUCTS = new ParameterType({
  name: 'products',
});

const STATE_SHOP_RESTOCKING = new EntityState({
  typeName: 'restocking',
  onEnter: function (entity) {
    // Sort all products and their inventory (entity.$get('inventory', [])) by how much they need to be restocked
    const products = entity.getParameter('products').getValue();
    const inventory = entity.$get('inventory', []);

    products.sort((a, b) => {
      const aStock = inventory.find(i => i === a);
      const bStock = inventory.find(i => i === b);

      if (!aStock) {
        return -1;
      }

      if (!bStock) {
        return 1;
      }

      return aStock.amount - bStock.amount;
    });

    // Restock all products to their base stock
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const stock = inventory.find(i => i.product === product);
      const baseStock = product.getParameter('baseStock').getValue();
      const difference = baseStock - (stock ? stock.amount : 0);

      for (let j = 0; j < difference; j++) {
        inventory.push(product);
      }
    }

    return STATE_SHOP_OPEN;
  },
});

const STATE_SHOP_OPEN = new EntityState({
  typeName: 'open',
});

const STATE_SHOP_CLOSED = new EntityState({
  typeName: 'closed',
});

/**
 * 
 * Product parameters and states
 * 
 */
const PARAMETER_PRODUCT_PRICE = new ParameterType({
  name: 'price',
  customToString: (value, originalValue) => `$${value.toFixed(2)}`,
});

const PARAMETER_PRODUCT_CAN_REDUCE_HUNGER = new ParameterType({
  name: 'canReduceHunger',
  customToString: (value, originalValue) => value ? 'Yes' : 'No',
});

const PARAMETER_PRODUCT_PRODUCTION_COST = new ParameterType({
  name: 'productionCost',
  customToString: (value, originalValue) => `$${value.toFixed(2)}`,
});

const PARAMETER_PRODUCT_BASE_STOCK = new ParameterType({
  name: 'baseStock',
});

const STATE_PRODUCT_RESEARCHED = new EntityState({
  typeName: 'researched',
});

/**
 * 
 * Create some base entity instances, giving them their parameters
 * 
 */
const CATEGORY_GLOBAL = new EntityCategory({
  name: 'Global',
  icons: '🌍',
  color: '#4180af',
  actions: [
    new EntityCategoryAction({
      name: 'Run Ad Campaign ($1000)',
      action: function () {
        const cost = 1000;
        if (!trySpendMoney(cost)) {
          alert(`You need $${cost} to run an ad campaign`);
          return;
        }

        const park = entities.find(e => e.category === CATEGORY_GLOBAL);
        const parkGuestIncreaseFromAds = park.$get('parkGuestIncreaseFromAds', 0);
        park.$set('parkGuestIncreaseFromAds', parkGuestIncreaseFromAds + 20);
    
        // TODO: Have a timer for the ad campaign to end
    
        createLog('📢 An ad campaign has been activated');
      },
    }),
  ],
});

const CATEGORY_RIDE = new EntityCategory({
  name: 'Rides',
  icons: '🎢',
  color: '#F6AE2D',
  actions: [
    new EntityCategoryAction({
      name: 'Build Carousel ($2000)',
      action: function () {
        const cost = 2000;
        if (!trySpendMoney(cost)) {
          alert(`You need $${cost} to build a carousel`);
          return;
        }

        createEntity({
          name: 'Carousel',
          category: CATEGORY_RIDE,
          parameters: [
            new Parameter({ parameterType: PARAMETER_RIDE_EXCITEMENT, baseValue: 0.3 }),
            new Parameter({ parameterType: PARAMETER_RIDE_RELIABILITY, baseValue: 0.999 }),
            new Parameter({ parameterType: PARAMETER_RIDE_TIME, baseValue: 5 }),
            new Parameter({ parameterType: PARAMETER_RIDE_GUEST_CAPACITY, baseValue: 20 }),
            new Parameter({ parameterType: PARAMETER_RIDE_ENTRY_FEE, baseValue: 2 }),
          ],
          currentState: STATE_RIDE_OPERATING_BOARDING,
        });
      },
    }),

    new EntityCategoryAction({
      name: 'Build Roller Coaster ($10000)',
      action: function () {
        const cost = 10000;
        if (!trySpendMoney(cost)) {
          alert(`You need $${cost} to build a Roller Coaster`);
          return;
        }

        createEntity({
          name: 'Roller Coaster',
          category: CATEGORY_RIDE,
          parameters: [
            new Parameter({ parameterType: PARAMETER_RIDE_EXCITEMENT, baseValue: 0.9 }),
            new Parameter({ parameterType: PARAMETER_RIDE_RELIABILITY, baseValue: 0.999 }),
            new Parameter({ parameterType: PARAMETER_RIDE_TIME, baseValue: 10 }),
            new Parameter({ parameterType: PARAMETER_RIDE_GUEST_CAPACITY, baseValue: 10 }),
            new Parameter({ parameterType: PARAMETER_RIDE_ENTRY_FEE, baseValue: 5 }),
          ],
          currentState: STATE_RIDE_OPERATING_BOARDING,
        });
      },
    }),

    new EntityCategoryAction({
      name: 'Build Ferris Wheel ($2900)',
      action: function () {
        const cost = 2900;
        if (!trySpendMoney(cost)) {
          alert(`You need $${cost} to build a Ferris Wheel`);
          return;
        }

        createEntity({
          name: 'Ferris Wheel',
          category: CATEGORY_RIDE,
          parameters: [
            new Parameter({ parameterType: PARAMETER_RIDE_EXCITEMENT, baseValue: 0.2 }),
            new Parameter({ parameterType: PARAMETER_RIDE_RELIABILITY, baseValue: 0.999 }),
            new Parameter({ parameterType: PARAMETER_RIDE_TIME, baseValue: 15 }),
            new Parameter({ parameterType: PARAMETER_RIDE_GUEST_CAPACITY, baseValue: 30 }),
            new Parameter({ parameterType: PARAMETER_RIDE_ENTRY_FEE, baseValue: 3 }),
          ],
          currentState: STATE_RIDE_OPERATING_BOARDING,
        });
      },
    }),
  ]
});

const CATEGORY_GUEST = new EntityCategory({
  name: 'Guests',
  icons: ['🧔', '👩‍🦰', '👨‍🦰', '👧', '👨'],
  color: '#673C4F'
});

const CATEGORY_STAFF = new EntityCategory({
  name: 'Staff',
  icons: '👷‍♂️',
  color: '#4F4F4F',
  actions: [
    new EntityCategoryAction({
      name: 'Hire Janitor ($50/day)',
      action: function () {
        createEntity({
          name: `${generateRandomHumanName()} (Janitor)`,
          category: CATEGORY_STAFF,
          parameters: [
            new Parameter({ parameterType: PARAMETER_STAFF_HAPPINESS, baseValue: 0.5 }),
            new Parameter({ parameterType: PARAMETER_STAFF_WAGE, baseValue: 50 }),
            new Parameter({ parameterType: PARAMETER_STAFF_CAN_REPAIR_RIDES, baseValue: false }),
          ],
          currentState: STATE_STAFF_WORKING_STANDBY,
        });
      },
    }),

    new EntityCategoryAction({
      name: 'Hire Mechanic ($100/day)',
      action: function () {
        createEntity({
          name: `${generateRandomHumanName()} (Mechanic)`,
          category: CATEGORY_STAFF,
          parameters: [
            new Parameter({ parameterType: PARAMETER_STAFF_HAPPINESS, baseValue: 0.5 }),
            new Parameter({ parameterType: PARAMETER_STAFF_WAGE, baseValue: 100 }),
            new Parameter({ parameterType: PARAMETER_STAFF_CAN_REPAIR_RIDES, baseValue: true }),
          ],
          currentState: STATE_STAFF_WORKING_STANDBY,
        });
      },
    }),
  ]
});

const CATEGORY_PRODUCT = new EntityCategory({
  name: 'Products',
  icons: '🛍️',
  color: '#8f4b4b',
  actions: [
    new EntityCategoryAction({
      name: 'Research Drink ($400)',
      action: function () {
        const cost = 400;
        if (!trySpendMoney(cost)) {
          alert(`You need $${cost} to research the drink product`);
          return;
        }

        createEntity({
          name: 'Drink',
          category: CATEGORY_PRODUCT,
          parameters: [
            new Parameter({ parameterType: PARAMETER_PRODUCT_PRICE, baseValue: 2 }),
            new Parameter({ parameterType: PARAMETER_PRODUCT_CAN_REDUCE_HUNGER, baseValue: true }),
            new Parameter({ parameterType: PARAMETER_PRODUCT_PRODUCTION_COST, baseValue: 1 }),
            new Parameter({ parameterType: PARAMETER_PRODUCT_BASE_STOCK, baseValue: 10 }),
          ],
          currentState: STATE_PRODUCT_RESEARCHED,
        });
      },
    }),

    new EntityCategoryAction({
      name: 'Research Hat ($400)',
      action: function () {
        const cost = 400;
        if (!trySpendMoney(cost)) {
          alert(`You need $${cost} to research the hat product`);
          return;
        }

        createEntity({
          name: 'Hat',
          category: CATEGORY_PRODUCT,
          parameters: [
            new Parameter({ parameterType: PARAMETER_PRODUCT_PRICE, baseValue: 10 }),
            new Parameter({ parameterType: PARAMETER_PRODUCT_CAN_REDUCE_HUNGER, baseValue: false }),
            new Parameter({ parameterType: PARAMETER_PRODUCT_PRODUCTION_COST, baseValue: 5 }),
            new Parameter({ parameterType: PARAMETER_PRODUCT_BASE_STOCK, baseValue: 5 }),
          ],
          currentState: STATE_PRODUCT_RESEARCHED,
        });
      },
    }),
  ]
});

const PRODUCT_BURGER = createEntity({
  name: 'Burger',
  category: CATEGORY_PRODUCT,
  parameters: [
    new Parameter({ parameterType: PARAMETER_PRODUCT_PRICE, baseValue: 5 }),
    new Parameter({ parameterType: PARAMETER_PRODUCT_PRODUCTION_COST, baseValue: 2 }),
    new Parameter({ parameterType: PARAMETER_PRODUCT_BASE_STOCK, baseValue: 10 }),
    new Parameter({ parameterType: PARAMETER_PRODUCT_CAN_REDUCE_HUNGER, baseValue: true }),
  ],
  currentState: STATE_PRODUCT_RESEARCHED,
});

const CATEGORY_SHOP = new EntityCategory({
  name: 'Shops',
  icons: '🏪',
  color: '#4b7040',
  actions: [
    new EntityCategoryAction({
      name: 'Build Burger Joint ($1000)',
      action: function () {
        const cost = 1000;
        if (!trySpendMoney(cost)) {
          alert(`You need $${cost} to build a Burger Joint`);
          return;
        }

        createEntity({
          name: 'Burger Joint',
          category: CATEGORY_SHOP,
          parameters: [
            new Parameter({
              parameterType: PARAMETER_SHOP_PRODUCTS,
              baseValue: [
                PRODUCT_BURGER,
              ]
            }),
          ],
          currentState: STATE_SHOP_RESTOCKING,
        });
      },
    }),
  ]
});

const categories = [
  CATEGORY_GLOBAL,
  CATEGORY_RIDE,
  CATEGORY_GUEST,
  CATEGORY_STAFF,
  CATEGORY_SHOP,
  CATEGORY_PRODUCT,
];

/**
 * Global (park)
 */
createEntity({
  name: 'Park',
  category: CATEGORY_GLOBAL,
  currentState: STATE_PARK_OPEN,
  parameters: [
    new Parameter({ parameterType: PARAMETER_PARK_MONEY, baseValue: 9000 }),
    new Parameter({ parameterType: PARAMETER_PARK_RATING, baseValue: 600 }),
    new Parameter({ parameterType: PARAMETER_PARK_EXCITEMENT_FACTOR, baseValue: 0.05 }),
    new Parameter({ parameterType: PARAMETER_PARK_TAXES, baseValue: 1000 }),
  ],
});
