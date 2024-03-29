const { Scanner } = require('homebridge-mi-hygrothermograph/lib/scanner');
const mqtt = require('mqtt');

class MiScanner extends Scanner {
  onStateChange(state) {
    console.log('state change', state);
    super.onStateChange(state);
    if (state === "poweredOff") process.exit();
  }
}

const lastTimestamps = {};

class Application {
    constructor(config, log) {
        this.config = config || {};
        this.log = log || console;

        this.temperatureMQTTTopic = undefined;
        this.humidityMQTTTopic = undefined;
        this.batteryMQTTTopic = undefined;

        this.mqttClient = this.setupMQTTClient();

        this.log.debug('Initialized application');
    }

    setupMQTTClient() {
        const {
            temperatureTopic,
            humidityTopic,
            batteryTopic,
            url,
            ...mqttOptions
        } = this.config.mqtt;

        this.temperatureMQTTTopic = temperatureTopic || 'temperature';
        this.humidityMQTTTopic = humidityTopic || 'humidity';
        this.batteryMQTTTopic = batteryTopic || 'battery';

        const client = mqtt.connect(url, mqttOptions);
        client.on('connect', () => {
            this.log.info('MQTT Client connected.');
            this.setupScanner();
        });
        client.on('reconnect', () => {
            this.log.debug('MQTT Client reconnecting.');
        });
        client.on('close', () => {
            this.log.debug('MQTT Client disconnected');
        });
        client.on('error', error => {
            this.log.error(error);
            client.end();
        });
        return client;
    }

    publishValueToMQTT(topic, value) {
        if (
            this.mqttClient.connected === false ||
            topic == null ||
            value == null
        ) {
            return;
        }
        this.log.debug(`MQTT publish: ${topic} ${value}`);
        this.mqttClient.publish(topic, String(value), {
            retain: true,
        });
    }

    setupScanner() {
        const eventHandler = (type, topic, value, name, peripheral) => {
            const {address, id} = peripheral;
            this.log.debug(`[${address || id}] [${name}] ${type}: ${value}`);
            const now = Date.now();
            const lastTimestamp = lastTimestamps?.[topic] || 0;
            const delta = now - lastTimestamp;
            lastTimestamps[topic] = now;

            if (delta < 10_000) {
                return;
            }

            this.publishValueToMQTT(topic, JSON.stringify({
                timestamp: Date.now(),
                value,
            }));
        };

        this.config.devices.forEach(device => {
            const scanner = new MiScanner(device.address, {
                log: this.log,
                bindKey: device.bindKey
            });
            scanner.on('temperatureChange', (temperature, peripheral) => eventHandler(
                'Temperature',
                device.mqttTopic + '/' + this.temperatureMQTTTopic,
                temperature,
                device.name,
                peripheral,
            ));
            scanner.on('humidityChange', (humidity, peripheral) => eventHandler(
                'Humidity',
                device.mqttTopic + '/' + this.humidityMQTTTopic,
                humidity,
                device.name,
                peripheral,
            ));
            scanner.on('batteryChange', (batteryLevel, peripheral) => eventHandler(
                'Battery level',
                device.mqttTopic + '/' + this.batteryMQTTTopic,
                batteryLevel,
                device.name,
                peripheral,
            ));
            scanner.on('error', error => {
                this.log.error(error);
            });
        });
    }
}

module.exports = {
    Application
};
