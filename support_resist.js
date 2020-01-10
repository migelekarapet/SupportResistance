// require modules
var mongo = require('mongojs')
var dl = require('datejs')
var fs = require('fs')

// price data
var data0 = require("./data/data1.js");

function prepareData(data0) {
	var data = [];
	for(var i in data0) {
		var item0 = data0[i];
		var item = {};
		item.d = new Date(item0[0]);
		item.o = item0[1];
		item.h = item0[2];
		item.l = item0[3];
		item.c = item0[4];
		item.v = item0[5];
		data.push(item);
	}
	
	return data;
}

function calcMaxPoints(data, start, end, depth) {
	var len = end-start;
	var i = start+depth;
	
	var retData = [];
	
	while(i<end-depth) {
		var center = data[i];
		var h0 = center.h;
		
		var bMax = true; 
		for(var j=1; j<=depth; j++) {
			var h_left = data[i-j].h;
			var h_right = data[i+j].h;
			if(h_left >= h0 || h_right >= h0) {
				bMax = false;
				break;
			}
		}
		
		if(bMax) {
			var o = {
				x: i,
				y: h0,
			}
			retData.push(o);
			
			i+=depth+1;
			continue;
		} 
		
		++i;
	}
	
	return retData;
}

function calcMinPoints(data, start, end, depth) {
	var len = end-start;
	var i = start+depth;
	
	var retData = [];
	
	while(i<end-depth) {
		var center = data[i];
		var h0 = center.h;
		
		var bMin = true; 
		for(var j=1; j<=depth; j++) {
			var h_left = data[i-j].h;
			var h_right = data[i+j].h;
			if(h_left <= h0 || h_right <= h0) {
				bMin = false;
				break;
			}
		}
		
		if(bMin) {
			var o = {
				x: i,
				y: h0,
			}
			retData.push(o);
			
			i+=depth+1;
			continue;
		} 
		
		++i;
	}
	
	return retData;
}

function calcBestLine(extremums) {
	var len = extremums.length;
	if(len < 2)
		return null;
	
	if(len == 2) {
		var line = calcLine(extremums[0], extremums[1]);
		line.i1x = extremums[0].x;
		line.i1y = extremums[0].y;
		line.i2x = extremums[1].x;
		line.i2y = extremums[1].y;
		return line;
	}
	
	if(len == 3) {
		var d1 = Math.abs(extremums[0] - extremums[1]);
		var d2 = Math.abs(extremums[1] - extremums[2]);
		if(d1 < d2) {
			var line = calcLine(extremums[0], extremums[1]);
			line.i1x = extremums[0].x;
			line.i1y = extremums[0].y;
			line.i2x = extremums[1].x;
			line.i2y = extremums[1].y;
			return line;
		} else {
			var line = calcLine(extremums[1], extremums[2]);
			line.i1x = extremums[1].x;
			line.i1y = extremums[1].y;
			line.i2x = extremums[2].x;
			line.i2y = extremums[2].y;
			return line;
		}
	}
	
	var min = 10000000000000000;
	var selLine = null;
	
	for(var i=0; i<len; i++) {
		for(var j=i+1; j<len; j++) {
			if(i==j)
				continue;
			
			var line = calcLine(extremums[i], extremums[j]);
			
			var n = 0;
			var s = 0;
			for(var k=0; k<len; k++) {
				if(k==i || k==j)
					continue;
				
				var y = extremums[k].y;
				var y1 = line.a + line.b * extremums[k].x;
				var d = Math.abs(y1-y);
				s += d;
				++n;
			}
			s = (n>0) ? s/n : null;
			if(s !== null && s < min) {
				min = s;
				selLine = line;
				selLine.i1x = extremums[i].x;
				selLine.i1y = extremums[i].y;
				selLine.i2x = extremums[j].x;
				selLine.i2y = extremums[j].y;
			}
		}
	}
	
	return selLine;
	
}

function calcLine(p1, p2) {
	var slope = (p2.y - p1.y) / (p2.x - p1.x);
	var y0 = p1.y - p1.x * slope;
	
	return {a: y0, b: slope};
}

function calcTradesForPeriod(data, periodIndex, periodLen, tp, sl, trades) {
	var start1 = periodIndex * periodLen;
	var end1 = start1 + periodLen;
	
	var start2 = end1;
	var end2 = start2 + periodLen;
	
	if(start2 >= data.length)
		return;
	
	if(end2 > data.length)
		end2 = data.length;
	
	var activeTrade = null;
			
	// close the open trade if there is one 
	if(trades.length > 0 && trades[ trades.length-1 ].c == null) {
		activeTrade = trades[ trades.length-1 ]
		for(var i=start1; i<end1; i++) {
			var item = data[i];
			var o = activeTrade.o;
			var c = item.c;
			var r = activeTrade.dir * ( c/o - 1 );
			
			if(r >= tp || r <= sl) {
				activeTrade.d2 = item.d;
				activeTrade.c = c;
				activeTrade.r = r;
				activeTrade.i2 = i;
				activeTrade.len = activeTrade.i2 - activeTrade.i1;
				
				trades.push(activeTrade);
				activeTrade = null;
				break;
			}
		}
	}
	
	// calc support and resistance lines on first half period 
	var minPoints = calcMinPoints(data, start1, end1, 5)
	var support = calcBestLine(minPoints);
	
	var maxPoints = calcMaxPoints(data, start1, end1, 5);
	var resistance = calcBestLine(maxPoints);
	
	// do trades for the next half period
	for(var i=start2+1; i<end2; i++) {
		
		// check to close the open trade if there is one 
		if(activeTrade) {
			var item = data[i];
			var o = activeTrade.o;
			var c = item.c;
			var r = activeTrade.dir * ( c/o - 1 );
			
			if(r >= tp || r <= sl) {
				activeTrade.d2 = item.d;
				activeTrade.c = c;
				activeTrade.r = r;
				activeTrade.i2 = i;
				activeTrade.len = activeTrade.i2 - activeTrade.i1;
				
				trades.push(activeTrade);
				activeTrade = null;
				continue;
			}
		}
		
		var c1 = data[i-1].c;
		var c2 = data[i].c;
		
		// check for crossing support and resistance lines
		if(support) {
			
			var cs1 = support.a + support.b * (i-1);
			var cs2 = support.a + support.b * (i);
			
			if(c1 > cs1 && c2 < cs2) {
				activeTrade = {
					dir: -1,
					d1: data[i].d,
					d2: null,
					i1: i,
					i2: null,
					o: c2,
					c: null,
					r: null,
					len: 0,
					a: support.a,
					b: support.b,
					l1x: support.i1x,
					l1y: support.i1y,
					l2x: support.i2x,
					l2y: support.i2y,
				}
			} 
		}
		
		if(resistance) {
			var cr1 = resistance.a + resistance.b * (i-1);
			var cr2 = resistance.a + resistance.b * (i);
			
			if(c1 < cr1 && c2 > cr2) {
				activeTrade = {
					dir: 1,
					d1: data[i].d,
					d2: null,
					i1: i,
					i2: null,
					o: c2,
					c: null,
					r: null,
					len: 0,
					a: resistance.a,
					b: resistance.b,
					l1x: resistance.i1x,
					l1y: resistance.i1y,
					l2x: resistance.i2x,
					l2y: resistance.i2y,
				}
			}
		}
	}
}

function saveSignalsToFile(signals, fname) {
	var sData = "Date\tSignal\tWT1\tWT2\tPrevWT1\tPrevWT2\tIndexInPrices\r\n";
	
	for(var i in signals) {
		var sig = signals[i];
		sData += sig.d.toString("MM/dd/yyyy hh:mm:ss") + "\t";
		sData += ((sig.sig == 1) ? "BUY" : "SELL") + "\t";
		sData += sig.wt1 + "\t";
		sData += sig.wt2 + "\t";
		sData += sig.wt1Prev + "\t";
		sData += sig.wt2Prev + "\t";
		sData += sig.priceIndex + "\r\n";
	}
	
	fs.writeFileSync(fname, sData);
}

function saveTradesToFile(trades, fname) {
	var sData = "DateOpen\tDateClose\tTradeDir\tLength\tOpen\tClose\tReturn\r\n";
	
	for(var i in trades) {
		var tr = trades[i];
		sData += tr.d1.toString("MM/dd/yyyy hh:mm:ss") + "\t";
		sData += tr.d2.toString("MM/dd/yyyy hh:mm:ss") + "\t";
		sData += tr.dir + "\t";
		sData += tr.len + "\t";
		sData += tr.o + "\t";
		sData += tr.c + "\t";
		sData += tr.r + "\r\n";
	}
	
	fs.writeFileSync(fname, sData);
}

function saveSupResTradesToFile(trades, fname) {
	var sData = "DateOpen\tDateClose\tindOpen\tindClose\tTradeDir\tlineA\tlineB\tln1X\tln1Y\tln2X\tln2Y\tLength\tOpen\tClose\tReturn\r\n";
	
	for(var i in trades) {
		var tr = trades[i];
		sData += tr.d1.toString("MM/dd/yyyy hh:mm:ss") + "\t";
		sData += tr.d2.toString("MM/dd/yyyy hh:mm:ss") + "\t";
		sData += tr.i1 + "\t";
		sData += tr.i2 + "\t";
		sData += tr.dir + "\t";
		sData += tr.a + "\t";
		sData += tr.b + "\t";
		sData += tr.l1x + "\t";
		sData += tr.l1y + "\t";
		sData += tr.l2x + "\t";
		sData += tr.l2y + "\t";
		sData += tr.len + "\t";
		sData += tr.o + "\t";
		sData += tr.c + "\t";
		sData += tr.r + "\r\n";
	}
	
	fs.writeFileSync(fname, sData);
}

function savePriceData(data, start, end, fname) {
	var sData = "Time\tOpen\tHigh\tLow\tClose\r\n";
	
	for(var i=start; i<end; i++) {
		var tr = data[i];
		sData += tr.d.toString("MM/dd/yyyy hh:mm:ss") + "\t";
		sData += tr.o + "\t";
		sData += tr.h + "\t";
		sData += tr.l + "\t";
		sData += tr.c + "\r\n";
	}
	
	fs.writeFileSync(fname, sData);
}

function main() {
	var data = prepareData(data0);
	var numPeriods = data.length/100;
	numPeriods = parseInt(numPeriods);
	
	var trades = [];
	for(var i=0; i<numPeriods; i++) {
		calcTradesForPeriod(data, i, 100, 0.01, -0.03, trades);
	}
	console.log(trades, trades.length);
	
	var longs = 0;
	var shorts = 0;
	var pos = 0;
	var neg = 0;
	var R = 0;
	
	for(var i in trades) {
		var r = trades[i].r;
		var dir = trades[i].dir;
		
		if(r > 0)
			pos++;
		else 
			neg++;
		
		if(dir > 0)
			longs ++;
		else 
			shorts ++;
		
		R += r
	}
	var batting = pos / (pos+neg);
	
	console.log(R, batting, longs, shorts);
	
	
	saveSupResTradesToFile(trades, "output/support_resist_trades.txt");
	savePriceData(data, 900, 11900, "output/prices_900_11900.txt");
	
}

main();