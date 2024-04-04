import puppeteer from 'puppeteer';
import fetch from 'node-fetch';
import fs from 'fs';

// let param = btoa(encodeURIComponent(JSON.stringify({
// 	"address": "397 Bridge St",
// 	"reference": "here:af:streetsection:dkpT01v4wzu7UDXzw0PoMA:CgcIBCDPt-UjEAEaAzM5Nw",
// 	"referenceType": "here_places",
// 	"latitude": 40.69136,
// 	"longitude": -73.9852,
// })));

const feedURL = 'https://www.ubereats.com/feed?diningMode=PICKUP&pl=JTdCJTIyYWRkcmVzcyUyMiUzQSUyMjM5NyUyMEJyaWRnZSUyMFN0JTIyJTJDJTIycmVmZXJlbmNlJTIyJTNBJTIyaGVyZSUzQWFmJTNBc3RyZWV0c2VjdGlvbiUzQWRrcFQwMXY0d3p1N1VEWHp3MFBvTUElM0FDZ2NJQkNEUHQtVWpFQUVhQXpNNU53JTIyJTJDJTIycmVmZXJlbmNlVHlwZSUyMiUzQSUyMmhlcmVfcGxhY2VzJTIyJTJDJTIybGF0aXR1ZGUlMjIlM0E0MC42OTEzNiUyQyUyMmxvbmdpdHVkZSUyMiUzQS03My45ODUyJTdE&sf=JTVCJTdCJTIydXVpZCUyMiUzQSUyMjJjN2NmN2VmLTczMGYtNDMxZi05MDcyLTM2YmMzOWY3YzEyMiUyMiUyQyUyMm9wdGlvbnMlMjIlM0ElNUIlNUQlN0QlMkMlN0IlMjJ1dWlkJTIyJTNBJTIyMWM3Y2Y3ZWYtNzMwZi00MzFmLTkwNzItMjZiYzM5ZjdjMDIxJTIyJTJDJTIyb3B0aW9ucyUyMiUzQSU1QiU3QiUyMnV1aWQlMjIlM0ElMjIzYzdjZjdlZi03MzBmLTQzMWYtOTA3Mi0yNmJjMzlmN2MwMjIlMjIlN0QlNUQlN0QlNUQ%3D';

console.log('launching puppeteer...');
const browser = await puppeteer.launch({ headless: 'new' });
const page = (await browser.pages())[0];

console.log('getting nearby restaurants..');
await page.goto(feedURL);

const cards = 'div:has(> div > div > div > a[data-testid="store-card"])';
await page.waitForSelector(cards);

const restaurants = [];
for (const el of await page.$$(cards)) {
	const offer = await el.evaluate(e => e.querySelector('picture + div > div')?.textContent) || '';
	if (offer.includes('Get 1 Free') || offer.includes('Offers')) {
		restaurants.push(await el.evaluate(e => e.querySelector('a').href));
	}
}

console.log(`${restaurants.length} potential restaurants with offers found! closing puppeteer...`);
await browser.close();

const allCompiled = [];
for (let i = 0; i < restaurants.length; i++) {
	const url = restaurants[i];

	console.log(`(${i+1}/${restaurants.length}) fetching ${url}...`);

	const body = await fetch(url, {
		headers: {
			'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
		},
	}).then(res => res.text());
	const reactData = body.match(/__REACT_QUERY_STATE__">(.*?)<\/script>/s)?.[1];
	const rawData = reactData && JSON.parse(decodeURIComponent(JSON.parse(`"${reactData.trim()}"`)));
	const data = rawData?.queries?.[0]?.state?.data;
	const section = data?.sections?.[0];
	if (data && section && section.isOnSale && data.catalogSectionsMap[section.uuid]) {
		const items = new Map();
		for (const { payload } of data.catalogSectionsMap[section.uuid]) {
			for (const item of payload.standardItemsPayload.catalogItems) {
				items.set(item.uuid, item);
			}
		}

		const deals = [];
		for (const item of items.values()) {
			if (item.itemPromotion) deals.push(item);
		}

		if (deals.length) { 
			const compiled = JSON.parse(data.metaJson);
			compiled.deals = deals;
			delete compiled.hasMenu;

			allCompiled.push(compiled);
			console.log(`got data for ${compiled.name}: ${deals.length} deal(s) found`);
		} else {
			console.log(`no deals found for this restaurant`);
		}
	} else {
		console.log(`no deals found for this restaurant`);
	}

	console.log('sleeping 3 seconds...');
	await new Promise(r => setTimeout(r, 3000));
}

fs.writeFileSync('./scraped.json', JSON.stringify(allCompiled));
