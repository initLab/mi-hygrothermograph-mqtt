const { Scanner } = require('homebridge-mi-hygrothermograph/lib/scanner');
const mqtt = require('mqtt');

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
        this.mqttClient.publish(topic, value, {
            retain: true,
        });
    }

    setupScanner() {
        this.config.devices.forEach(device => {
            const scanner = new Scanner(device.address, {
                log: this.log,
                bindKey: device.bindKey
            });
            scanner.on('temperatureChange', (temperature, peripheral) => {
                const {address, id} = peripheral;
                this.log.debug(`[${address || id}] [${device.name}] Temperature: ${temperature}C`);
                this.publishValueToMQTT(device.mqttTopic + '/' + this.temperatureMQTTTopic, temperature);
            });
            scanner.on('humidityChange', (humidity, peripheral) => {
                const {address, id} = peripheral;
                this.log.debug(`[${address || id}] [${device.name}] Humidity: ${humidity}%`);
                this.publishValueToMQTT(device.mqttTopic + '/' + this.humidityMQTTTopic, humidity);
            });
            scanner.on('batteryChange', (batteryLevel, peripheral) => {
                const {address, id} = peripheral;
                this.log.debug(`[${address || id}] [${device.name}] Battery level: ${batteryLevel}%`);
                this.publishValueToMQTT(device.mqttTopic + '/' + this.batteryMQTTTopic, batteryLevel);
            });
            scanner.on('error', error => {
                this.log.error(error);
            });
        });
    }
}

module.exports = {
    Application
};
