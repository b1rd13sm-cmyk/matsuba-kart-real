// Shared by WebGL shells/LODs and the Canvas fallback. These neutral defaults
// are illustrative estimates, never observations of an individual building.
// Explicit mapped/reviewed/developer colors always take precedence.
(()=>{
  const defaults=Object.freeze({
    house:Object.freeze({wall:'#eceeeb',roof:'#50565e'}),
    apartments:Object.freeze({wall:'#e3e6e7',roof:'#646d75'}),
    institution:Object.freeze({wall:'#e8e9e5',roof:'#646e78'}),
    commercial:Object.freeze({wall:'#d7dcdf',roof:'#596570'}),
    outbuilding:Object.freeze({wall:'#bcc4c8',roof:'#707a83'}),
    'large-unknown':Object.freeze({wall:'#dfe3e4',roof:'#69737a'})
  });
  globalThis.KART_BUILDING_COLORS=Object.freeze({
    defaults,
    resolve(building){const d=defaults[building.style]||defaults['large-unknown'];return {wall:building.wallColor||d.wall,roof:building.roofColor||d.roof,wallEstimated:!building.wallColor,roofEstimated:!building.roofColor}}
  });
})();
