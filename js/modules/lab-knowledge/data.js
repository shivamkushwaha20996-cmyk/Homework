export const LAB_SETUPS=[
{id:'rf-cal',name:'RF Cal',icon:'fa-tower-broadcast',desc:'RF calibration setup, cable path, calibration points and verification.',revision:'Rev 1.0'},
{id:'final-rad',name:'Final Rad',icon:'fa-satellite-dish',desc:'Final radiation setup, chamber/instrument connections and measurement flow.',revision:'Rev 1.0'},
{id:'audio-test',name:'Audio Test',icon:'fa-volume-high',desc:'Audio test station setup, routing, levels and common failure checks.',revision:'Rev 1.0'},
{id:'smd-ft',name:'SMD FT',icon:'fa-microchip',desc:'SMD functional test setup, fixture connections and station checklist.',revision:'Rev 1.0'},
{id:'conduction-test',name:'Conduction Test',icon:'fa-bolt',desc:'Conducted test setup, power/RF path and measurement verification.',revision:'Rev 1.0'},
{id:'imei-test',name:'IMEI Test',icon:'fa-mobile-screen-button',desc:'IMEI test setup, device identity verification, connection flow and result checklist.',revision:'Rev 1.0'}];
export const LAB_EQUIPMENT=[
{id:'multimeter',name:'Multimeter',icon:'fa-gauge-high',desc:'Voltage, current, resistance and continuity measurements.',revision:'Rev 1.0'},
{id:'power-supply',name:'Power Supply',icon:'fa-plug-circle-bolt',desc:'Programmable DC supply setup, limits and protection checks.',revision:'Rev 1.0'},
{id:'oscilloscope',name:'Oscilloscope',icon:'fa-wave-square',desc:'Waveform, timing, ripple and transient measurements.',revision:'Rev 1.0'},
{id:'power-spectrum',name:'Power Spectrum',icon:'fa-chart-line',desc:'RF spectrum/power measurements and analyzer setup guidance.',revision:'Rev 1.0'},
{id:'lcr-meter',name:'LCR Meter',icon:'fa-sliders',desc:'Inductance, capacitance, resistance and component verification.',revision:'Rev 1.0'}];
export const LAB_TROUBLESHOOTING=[
{symptom:'No measurement / no response',checks:['Verify power and instrument state','Check cable/fixture seating','Confirm correct model/setup selection','Check instrument configuration and range'],resolution:'Re-seat connections, restore the approved setup configuration, then repeat the measurement.'},
{symptom:'Unexpected measurement value',checks:['Verify test limits','Check cable and adapter path','Confirm calibration status','Repeat with known-good reference'],resolution:'Isolate the measurement chain one element at a time and compare against the approved reference condition.'},
{symptom:'Communication / instrument not detected',checks:['USB/LAN/GPIB connection','Instrument address','Driver/application state','Power-cycle if permitted'],resolution:'Restore the approved interface settings and reconnect using the station work instruction.'},
{symptom:'Intermittent result',checks:['Inspect connector/fixture','Check cable movement','Check DUT seating','Repeat with reference DUT'],resolution:'Stabilize the physical setup first, then verify the result with a known-good reference.'}];
