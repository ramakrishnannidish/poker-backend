import { NotFound, Conflict } from './errors';

// transform from key/value to list and back
const transform = (data) => {
  let attributes;
  if (data && data.forEach) {
    attributes = {};
    data.forEach((aPair) => {
      if (!attributes[aPair.Name]) {
        attributes[aPair.Name] = {};
      }
      attributes[aPair.Name] = aPair.Value;
    });
  } else {
    attributes = [];
    Object.keys(data).forEach((anAttributeName) => {
      data[anAttributeName].forEach((aValue) => {
        attributes.push({
          Name: anAttributeName,
          Value: aValue,
          Replace: true,
        });
      });
    });
  }
  return attributes;
};

function Db(sdb) {
  this.sdb = sdb;
  this.domain = 'ab-accounts';
}


Db.prototype.getAccount = function getAccount(accountId) {
  return new Promise((fulfill, reject) => {
    this.sdb.getAttributes({
      DomainName: this.domain,
      ItemName: accountId,
    }, (err, data) => {
      if (err) {
        reject(`Error: ${err}`);
        return;
      }
      if (!data.Attributes) {
        throw new NotFound(`Account with ID ${accountId} not found.`);
      }
      fulfill(transform(data.Attributes));
    });
  });
};

Db.prototype.checkAccountConflict = function checkAccountConflict(accountId, email) {
  const idCheck = new Promise((fulfill, reject) => {
    this.sdb.getAttributes({
      DomainName: this.domain,
      ItemName: accountId,
    }, (err, data) => {
      if (err) {
        reject(`Error: ${err}`);
        return;
      }
      if (data.Attributes !== undefined) {
        throw new Conflict(`account with same Id ${accountId} found.`);
      }
      fulfill();
    });
  });
  const mailCheck = new Promise((fulfill, reject) => {
    this.sdb.select({
      SelectExpression: `select * from \`${this.domain}\` where email =  "${email}" or pendingEmail =  "${email}"  limit 1`,
    }, (err, data) => {
      if (err) {
        reject(`Error: ${err}`);
        return;
      }
      if (data.Items && data.Items.length > 0) {
        throw new Conflict(`email ${email} taken.`);
      }
      fulfill();
    });
  });
  return Promise.all([idCheck, mailCheck]);
};

Db.prototype.getAccountByToken = function getAccountByToken(token) {
  return new Promise((fulfill, reject) => {
    this.sdb.select({
      SelectExpression: `select * from \`${this.domain}\` where pendingToken =  "${token}" limit 1`,
    }, (err, data) => {
      if (err) {
        reject(`Error: ${err}`);
        return;
      }
      if (!data.Items || data.Items.length === 0) {
        throw new NotFound(`token ${token} unknown.`);
      }
      const rv = transform(data.Items[0].Attributes);
      rv.id = data.Items[0].Name;
      fulfill(rv);
    });
  });
};

Db.prototype.getAccountByEmail = function getAccountByEmail(email) {
  return new Promise((fulfill, reject) => {
    this.sdb.select({
      SelectExpression: `select * from \`${this.domain}\` where email =  "${email}" limit 1`,
    }, (err, data) => {
      if (err) {
        reject(`Error: ${err}`);
        return;
      }
      if (!data.Items || data.Items.length === 0) {
        throw new NotFound(`email ${email} unknown.`);
      }
      const rv = transform(data.Items[0].Attributes);
      rv.id = data.Items[0].Name;
      fulfill(rv);
    });
  });
};

Db.prototype.putAccount = function putAccount(accountId, attributes) {
  return new Promise((fulfill, reject) => {
    this.sdb.putAttributes({
      DomainName: this.domain,
      ItemName: accountId,
      Attributes: transform(attributes),
    }, (err, data) => {
      if (err) {
        reject(`Error: ${err}`);
        return;
      }
      fulfill(data);
    });
  });
};

Db.prototype.updateEmailComplete = function updateEmailComplete(accountId, email) {
  const put = new Promise((fulfill, reject) => {
    this.sdb.putAttributes({
      DomainName: this.domain,
      ItemName: accountId,
      Attributes: transform({ email: [email] }),
    }, (err, data) => {
      if (err) {
        reject(`Error: ${err}`);
        return;
      }
      fulfill(data);
    });
  });
  const del = new Promise((fulfill, reject) => {
    this.sdb.deleteAttributes({
      DomainName: this.domain,
      ItemName: accountId,
      Attributes: [
        { Name: 'pendingEmail' },
        { Name: 'pendingToken' },
        { Name: 'pendingTime' },
      ],
    }, (err, data) => {
      if (err) {
        reject(`Error: ${err}`);
        return;
      }
      fulfill(data);
    });
  });
  return Promise.all([put, del]);
};

module.exports = Db;
