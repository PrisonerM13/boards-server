const mongoose = require('mongoose');
const { getDuplicates } = require('./utils');

function connectDB(dbName) {
  const DB_URL =
    process.env.MONGODB_URI || `mongodb://localhost:27017/${dbName}`;
  mongoose.connect(DB_URL, { useNewUrlParser: true });
  mongoose.connection.once('open', function() {
    console.log(`Successfully connected to MongoDB[${dbName}]`);
  });
  mongoose.connection.on(
    'error',
    console.error.bind(console, 'connection error:'),
  );
  mongoose.set('useFindAndModify', false);
}

function setReadonlyMiddleware(schema, ...readOnlyFields) {
  schema.pre('findByIdAndUpdate', async function(next) {
    validate.call(this);
    next(this.error());
  });

  schema.pre('findOneAndUpdate', async function(next) {
    validate.call(this);
    next(this.error());
  });

  schema.pre('updateMany', async function(next) {
    const docsToUpdate = await this.model.find(this.getQuery());
    for (const doc of docsToUpdate) {
      validate.call(this, doc);
      if (this.error()) {
        break;
      }
    }
    next(this.error());
  });

  async function validate(doc) {
    const current = doc || (await this.model.findOne(this.getQuery()));
    const update = this.getUpdate();
    readOnlyFields.forEach(field => {
      if (update[field] && current[field] !== update[field]) {
        this.error(new Error(`field ${field} is read-only`));
      }
    });
  }
}

function clearBuffers(obj) {
  if (obj._doc) {
    Object.entries(obj._doc).forEach(([key, value]) => {
      if (value instanceof Buffer) {
        obj[key] = undefined;
      }
      if (typeof value === 'object' || Array.isArray(value)) {
        if (obj[key]) {
          clearBuffers(obj[key]);
        }
      }
    });
  }
  return obj;
}

const Validate = {
  unique: function(fieldName, model) {
    return {
      validator: async function(value) {
        if (!this.isNew) {
          return true;
        }
        const count = await this.model(model)
          .estimatedDocumentCount({ [fieldName]: value })
          .catch(err => err);
        return count <= 1; // If `count` is not zero, "invalidate"
      },
      message: props => `${props.value} already exists.`,
    };
  },
  get uniqueArrayItem() {
    let duplicates;
    return {
      validator: function(arr) {
        if(arr.length <= 1) {
          return true;
        }
        duplicates = getDuplicates(arr);
        return duplicates.length === 0;
      },
      message: function(props) {
        return `${duplicates} already exist(s).`;
      },
    };
  },
  maxCount: function(limit) {
    return [
      value => value.length <= limit,
      `{PATH} count exceeds the limit of ${limit}`,
    ];
  },
};

module.exports = {
  connectDB,
  clearBuffers,
  setReadonlyMiddleware,
  Validate,
};
