const entities = [];
const logs = [];

let currentTime = 0;
const randomNumberGenerator = new Math.seedrandom(currentTime);
const context = {
  minimalUI: false,

  currentTime,

  random: () => randomNumberGenerator(),
  consistentRandom: (seed) => new Math.seedrandom(seed)(),
}

function findEntityIndex(entities, entity) {
  for (let i = 0; i < entities.length; i++) {
    if (entities[i].id === entity.id) {
      return i;
    }
  }

  return -1;
}

function removeEntity(entities, entity) {
  const index = findEntityIndex(entities, entity);

  if (index !== -1) {
    entities.splice(index, 1);
    return;
  }

  console.error('Entity not found', entity, entities);
  throw new Error('Entity not found');
}

function createLog(message, isImportant = false) {
  if (context.minimalUI) {
    return;
  }

  logs.push({
    timestamp: currentTime,
    message,
    isImportant,
  });
}

function discoverGlobalParameters(entities) {
  const globalParameters = {};

  // Global parameters are parameters that are not tied to a specific entity, or at least
  // are useful for all other entities to know about
  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];

    for (let j = 0; j < entity.parameters.length; j++) {
      const parameter = entity.parameters[j];

      if (parameter.type.isGloballyAccessible) {
        const globalName = parameter.type.name;

        // If the global parameter already exists, we need to merge the values
        if (globalParameters[globalName]) {
          if (globalParameters[globalName] instanceof MergedParameter) {
            globalParameters[globalName].addParameter(parameter);
          } else {
            const mergedParameter = new MergedParameter([globalParameters[globalName], parameter]);
            globalParameters[globalName] = mergedParameter;
          }
        } else {
          globalParameters[globalName] = parameter;
        }
      }
    }
  }

  return globalParameters;
}

function updateSimulation(currentTime) {
  const globalParameters = discoverGlobalParameters(entities);
  const randomNumberGenerator = new Math.seedrandom(currentTime);
  context.currentTime = currentTime;
  context.random = () => randomNumberGenerator();

  context.global = {
    getParameter: (parameterName) => {
      if (!globalParameters[parameterName]) {
        throw new Error(`Global parameter ${parameterName} not found`);
      }

      return globalParameters[parameterName];
    },

    findEntitiesByCategory: (category) => {
      return entities.filter(e => e.category === category);
    },

    findEntitiesByCategoryName: (categoryName) => {
      return entities.filter(e => e.category.name === categoryName);
    }
  };

  entities.forEach(entity => {
    context.self = entity;
    entity.update();
  });

  context.self = null;

  document.dispatchEvent(new CustomEvent('simulation-updated', {
    detail: {
      entities,
      logs,
      context
    }
  }));
}

function createSimulation() {
  let tickInterval;
  let wantsToPause = false;

  function setupInterval(millisecondsPerTick) {
    // If millisecondsPerTick is 0, we want to loop as fast as possible.
    if (millisecondsPerTick === 0) {
      const loop = () => {
        if (wantsToPause) {
          return;
        }

        currentTime++;
        updateSimulation(currentTime);
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    } else {
      tickInterval = setInterval(() => {
        currentTime++;
        updateSimulation(currentTime);
      }, millisecondsPerTick);
    }
  }
  
  return {
    pause: () => {
      wantsToPause = true;
      clearInterval(tickInterval);
    },
    nextTick: () => {
      currentTime++;
      updateSimulation(currentTime);
    },
    start: (millisecondsPerTick) => {
      wantsToPause = false;
      setupInterval(millisecondsPerTick);
    },
    resume: (millisecondsPerTick) => {
      wantsToPause = false;
      clearInterval(tickInterval);
      setupInterval(millisecondsPerTick);
    },
    isPaused: () => wantsToPause,
  }
}