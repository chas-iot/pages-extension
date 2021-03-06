'use strict';

const {APIHandler, APIResponse, Database} = require('gateway-addon');
const manifest = require('../manifest.json');
const PagesDB = require('./pages-db.js');

let PagesAdaptor = null;
try {
  PagesAdaptor = require('./pages-adaptor');
} catch (e) {
  console.error(`pages-api-handler (A) no PagesAdaptor: ${e}`);
}

/**
 * Pages API handler.
 */
class PagesAPIHandler extends APIHandler {
  constructor(addonManager) {
    super(addonManager, manifest.id);
    addonManager.addAPIHandler(this);

    this.activeDeviceList = [];
    this.handlers = {};
    this.debug = {};

    let pages_db_location = '/home/pi/.mozilla-iot/pages';

    const db = new Database(manifest.id);
    db.open()
      .then(() => {
        return db.loadConfig();
      })
      .then((config) => {
        if (config && config.dblocation) {
          pages_db_location = config.dblocation;
        }
        if (config && config.debug) {
          const t = config.debug.split(',');
          t.forEach((item) => {
            if (item.trim().toLowerCase() && item.trim().toLowerCase() !== '') {
              this.debug[item.trim().toLowerCase()] = true;
            }
          });
        }
        return PagesDB.open(pages_db_location);
      })
      .then(() => {
        if (PagesAdaptor) {
          this.pagesAdaptor = new PagesAdaptor(addonManager, this);
          // we don't get informed of devices being deleted, so cleanup 10 mins after startup
          // need a better solution, as the gateway can run for weeks without a restart
          setTimeout(async () => {
            PagesDB.cleanup_things(this.activeDeviceList);
          }, (10 * 60 * 1000));
        }
      }).catch((e) => {
        console.error(`pages-api-handler  -  CANNOT CONTINUE  - ${e}`);
        throw (e);
      });

    // register all of the API handlers here
    const h = this.handlers;

    h['/group'] = (request) => {
      if (request.body.item) {
        return PagesDB.get_contents(request.body.item);
      } else {
        return PagesDB.get_list('G');
      }
    };

    h['/page'] = (request) => {
      if (request.body.item) {
        return PagesDB.get_contents(request.body.item);
      } else {
        return PagesDB.get_list('P');
      }
    };

    h['/group/add'] = (request) => {
      return PagesDB.add_principal('G', request.body.name);
    };

    h['/page/add'] = (request) => {
      return PagesDB.add_principal('P', request.body.name);
    };

    h['/group/delete'] = (request) => {
      return PagesDB.delete_principal(request.body.item);
    };

    h['/page/delete'] = (request) => {
      return PagesDB.delete_principal(request.body.item);
    };

    h['/group/listavailable'] = (request) => {
      return PagesDB.get_available_links(request.body.item,
                                         'T');
    };

    h['/page/listavailable'] = (request) => {
      return PagesDB.get_available_links(request.body.item,
                                         'G', 'T');
    };

    h['/page/insert'] = (request) => {
      return PagesDB.insert_link(request.body.container,
                                 request.body.contained,
                                 request.body.link_order);
    };

    h['/group/insert'] = (request) => {
      return PagesDB.insert_link(request.body.container,
                                 request.body.contained,
                                 request.body.link_order);
    };

    h['/delete_link'] = (request) => {
      return PagesDB.delete_link(request.body.item);
    };

    h['/update_link_order'] = (request) => {
      const x = [];
      for (const y in request.body) {
        if (request.body.hasOwnProperty(y)) {
          x.push({
            rowid: y,
            link_order: request.body[y],
          });
        }
      }
      return PagesDB.update_link_order(x);
    };
  }

  async handleRequest(request) {
    let result = null;

    if (request.method === 'POST') {
      const handle = this.handlers[request.path];
      if (handle) {
        try {
          result = await handle(request);
        } catch (e) {
          console.error('pages-api-handler (B): ', e.toString());
        }
      }
    }

    if (result !== null) {
      if (this.debug.request || this.debug[request.path]) {
        // eslint-disable-next-line max-len
        console.log(`pages-api-handler: handled request for ${request.method} | ${request.path} | ${JSON.stringify(request.body)}`);
      }

      if (this.debug.response || this.debug[request.path]) {
        console.log('pages-api-handler: result: ', JSON.stringify(result));
      }

      return new APIResponse({
        status: 200,
        contentType: 'application/json',
        content: JSON.stringify(result),
      });
    }
    // eslint-disable-next-line max-len
    console.error(`pages-api-handler (C): no handler for ${request.method} | ${request.path} | ${JSON.stringify(request.body)}`);
    return new APIResponse({
      status: 404,
      contentType: 'text/plain',
      content: `no handler for ${request.method} | ${request.path}`,
    });
  }

  // called from the adapter connected into the gateway data
  async thingAddNotification(id, device) {
    this.activeDeviceList.push(id);
    await PagesDB.upsert_thing(id, device.title);
  }

  async thingRemoveNotification(id) {
    // if/when remove notification is fully active, we can remove this.activeDeviceList
    await PagesDB.delete_thing(id);
  }

}

module.exports = PagesAPIHandler;
