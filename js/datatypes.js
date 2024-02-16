
class EntityCategory {
  constructor({ name, icons, color, actions }) {
    this.name = name;
    this.icons = icons;
    this.color = color;
    this.actions = actions || [];
  }

  localeCompare(other) {
    return this.toString().localeCompare(other.toString());
  }

  entityToString(entity) {
    const icon = Array.isArray(this.icons)
      ? this.icons[Math.floor(context.consistentRandom(entity.name) * this.icons.length)]
      : this.icons;

    return `${icon} ${entity.name}`;
  }

  toString() {
    return this.name;
  }
}

class EntityCategoryAction {
  constructor({ name, action }) {
    this.name = name;
    this.action = action;
  }

  execute() {
    return this.action();
  }
}

class ParameterType {
  constructor({ name, clampFunction = null, isGloballyAccessible = false, customToString = null }) {
    this.name = name;
    this.isGloballyAccessible = isGloballyAccessible;

    this.customToString = customToString;
    this.clampFunction = clampFunction;
  }

  clamp(value) {
    if (this.clampFunction) {
      return this.clampFunction(value);
    }

    return value;
  }

  toString(value) {
    const originalValue = value;

    if (value instanceof Entity) {
      value = value.category.entityToString(value);
    } else if (Array.isArray(value)) {
      const toStringedArray = value.map(v => this.toString(v));
      const json = JSON.stringify(toStringedArray, null, 2);
      value = `Array[${value.length}] ${json}`;
    } else if (typeof value === 'object') {
      const toStringedValue = JSON.stringify(value, null, 2);

      value = `Object ${toStringedValue}`;
    }

    if (this.customToString) {
      return this.customToString(value, originalValue);
    }

    return value;
  }
}

class Parameter {
  constructor({ parameterType, baseValue }) {
    this.type = parameterType;
    this.baseValue = baseValue;
    this.value = baseValue;
  }

  getValue() {
    return this.value;
  }

  setValue(value) {
    this.value = this.type.clamp(value);
  }

  toString(value) {
    return this.type.toString(value);
  }
}

class MergedParameter {
  constructor(parameters) {
    this.parameters = parameters;
  }

  addParameter(parameter) {
    this.parameters.push(parameter);
  }

  getValue() {
    // TODO: Handle non number values
    return this.parameters.reduce((acc, parameter) => acc + parameter.getValue(), 0);
  }

  setValue(value) {
    throw new Error('Cannot set value on merged parameter');
  }
}

class EntityState {
  constructor({ typeName, onEnter, onExit, onUpdate }) {
    this.typeName = typeName;
    this.onEnter = onEnter;
    this.onExit = onExit;
    this.onUpdate = onUpdate;
  }

  is(typeName) {
    return this.typeName === typeName;
  }

  enter(entity, previousState) {
    const override = this.onEnter ? this.onEnter(entity, previousState) : null;

    return override;
  }

  exit(entity, nextState) {
    const override = this.onExit ? this.onExit(entity, nextState) : null;

    return override;
  }

  update(entity) {
    if (this.onUpdate) {
      const override = this.onUpdate(entity);

      return override;
    }
  }
}

class Entity {
  constructor({ name, category, parameters, currentState }) {
    // Generate a unique ID for this entity for comparison purposes
    this.id = Math.floor((Date.now() / 1000) + (context.random() * 1000000));

    this.name = name;
    this.category = category;

    // Sort the parameters by name
    this.parameters = parameters.sort((a, b) => a.type.name.localeCompare(b.type.name));
    this.parameterLookup = {};

    for (let i = 0; i < parameters.length; i++) {
      this.parameterLookup[parameters[i].type.name] = parameters[i];
    }

    // Can be used by states to store transient data
    this.store = {};

    this.setState(currentState);
  }

  $get(key, defaultValue) {
    if (this.store[key] === undefined) {
      this.store[key] = defaultValue;
    }

    return this.store[key];
  }

  $set(key, value) {
    this.store[key] = value;
  }

  $unset(key) {
    delete this.store[key];
  }

  getParameter(parameterTypeName) {
    if (!this.parameterLookup[parameterTypeName]) {
      throw new Error(`Parameter ${parameterTypeName} not found on ${this.name}. Parameters: ${this.parameters.map(p => p.type.name).join(', ')}`);
    }

    return this.parameterLookup[parameterTypeName];
  }

  setState(state) {
    const previousState = this.currentState;

    if (previousState) {
      const override = previousState.exit(this, state);

      if (override) {
        this.setState(override);
        return;
      }
    }

    this.currentState = state;

    if (this.currentState) {
      const nextState = this.currentState.enter(this, previousState);

      if (nextState) {
        this.setState(nextState);
      }
    }

    return this.currentState;
  }

  getState() {
    return this.currentState;
  }

  update() {
    if (this.currentState) {
      const nextState = this.currentState.update(this);

      if (nextState) {
        this.setState(nextState);
      }
    }
  }
}
