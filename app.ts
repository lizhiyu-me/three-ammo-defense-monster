///<reference path="./definitions/three.d.ts"/>
///<reference path="./definitions/detector.d.ts"/>
///<reference path="./definitions/ammo.d.ts"/>

class Engine {
	private renderer: THREE.WebGLRenderer;
	private scene: THREE.Scene;
	private camera: THREE.PerspectiveCamera;
	private light: THREE.Light;

	private clock = new THREE.Clock();
	private physicsWorld: Ammo.btDiscreteDynamicsWorld;
	private rigidBodies = new Array<THREE.Object3D>();

	constructor(element: HTMLElement, clearColor: number) {
		this.renderer = new THREE.WebGLRenderer();
		this.renderer.setClearColor(clearColor);
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		element.appendChild(this.renderer.domElement);

		this.scene = new THREE.Scene();

		// Physics configuration
		const collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
		const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
		const overlappingPairCache = new Ammo.btAxisSweep3(new Ammo.btVector3(-1000, -1000, -1000), new Ammo.btVector3(1000, 1000, 1000));
		const solver = new Ammo.btSequentialImpulseConstraintSolver();

		this.physicsWorld = new Ammo.btDiscreteDynamicsWorld(dispatcher, overlappingPairCache, solver, collisionConfiguration);
		this.physicsWorld.setGravity(new Ammo.btVector3(0, -16, 0));
	}

	public enableShadows(): void {
		this.renderer.shadowMap.enabled = true;
	}

	public setCamera(camera: THREE.PerspectiveCamera): void {
		this.camera = camera;
		window.addEventListener('resize', () => {
			this.camera.aspect = window.innerWidth / window.innerHeight;
			this.camera.updateProjectionMatrix();
			this.renderer.setSize(window.innerWidth, window.innerHeight);
		}, false);
	}

	public getCamera(): THREE.PerspectiveCamera {
		return this.camera;
	}

	public addLight(light: THREE.Light): void {
		this.light = light;
		this.scene.add(this.light);
	}

	public addObject(object: THREE.Object3D): void {
		this.scene.add(object);
	}

	public addPhysicsObject(object: THREE.Object3D, body: Ammo.btRigidBody, mass: number): void {
		object.userData.physicsBody = body;
		if (mass > 0) {
			this.rigidBodies.push(object);
			body.setActivationState(4); // Disable deactivation
		}
		this.scene.add(object);
		this.physicsWorld.addRigidBody(body);
	}


	private tempTransform = new Ammo.btTransform();

	private updatePhysics(delta: number) {
		// Step world
		this.physicsWorld.stepSimulation(delta, 10);

		// Update rigid bodies
		const len = this.rigidBodies.length;
		for (let i = 0; i < len; i++) {
			var objThree = this.rigidBodies[i];
			var ms = objThree.userData.physicsBody.getMotionState();
			if (ms) {
				ms.getWorldTransform(this.tempTransform);

				let p = this.tempTransform.getOrigin();
				objThree.position.set(p.x(), p.y(), p.z());

				let q = this.tempTransform.getRotation();
				objThree.quaternion.set(q.x(), q.y(), q.z(), q.w());
			}
		}
	}

	public update(controls, edgeZ): number {

		const len = this.rigidBodies.length;
		for (let i = 0; i < len; i++) {
			var objThree = this.rigidBodies[i];
			if (objThree.position.z > edgeZ) {
				controls.enabled = false;
				const message = document.getElementById('message');
				const blocker = document.getElementById('blocker');
				const gameOver = document.getElementById('gameOver');
				blocker.style.display = 'none';
				message.style.display = 'none';
				gameOver.style.display = 'block';
				lockPointer(controls);
				return;
			}
		}

		const deltaTime = this.clock.getDelta();
		controls.enabled && this.updatePhysics(deltaTime);
		// if(this.rigidBodies)gameOverChecker.call(this.rigidBodies);
		this.renderer.render(this.scene, this.camera);
		return deltaTime;
	}
}

//-------------------------------------------------------------------

class ShapeFactory {

	private engine: Engine;

	constructor(engine: Engine) {
		this.engine = engine;
	}

	private createRigidBody(threeObject: THREE.Object3D, physicsShape: Ammo.btConvexShape, mass: number, pos: THREE.Vector3, quat: THREE.Quaternion): void {
		var transform = new Ammo.btTransform();
		transform.setIdentity();
		transform.setOrigin(new Ammo.btVector3(pos.x, pos.y, pos.z));
		transform.setRotation(new Ammo.btQuaternion(quat.x, quat.y, quat.z, quat.w));
		const motionState = new Ammo.btDefaultMotionState(transform);

		const localInertia = new Ammo.btVector3(0, 0, 0);
		physicsShape.calculateLocalInertia(mass, localInertia);

		var rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, physicsShape, localInertia);
		var body = new Ammo.btRigidBody(rbInfo);

		this.engine.addPhysicsObject(threeObject, body, mass);
	}

	public createParalellepiped(sx: number, sy: number, sz: number, mass: number, pos: THREE.Vector3, quat: THREE.Quaternion, material: THREE.Material): THREE.Mesh {
		let threeObject = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz, 1, 1, 1), material);
		threeObject.position.copy(pos);
		threeObject.quaternion.copy(quat);
		let shape = new Ammo.btBoxShape(new Ammo.btVector3(sx * 0.5, sy * 0.5, sz * 0.5));
		shape.setMargin(0.05);

		this.createRigidBody(threeObject, shape, mass, pos, quat);
		return threeObject;
	}

	public createSphere(radius: number, mass: number, pos: THREE.Vector3, quat: THREE.Quaternion, material: THREE.Material): THREE.Mesh {
		var threeObject = new THREE.Mesh(new THREE.SphereGeometry(radius, 18, 16), material);
		threeObject.position.copy(pos);
		threeObject.quaternion.copy(quat);
		let shape = new Ammo.btSphereShape(radius);
		shape.setMargin(0.05);

		this.createRigidBody(threeObject, shape, mass, pos, quat);
		return threeObject;
	}
}

//-------------------------------------------------------------------

class CameraMoveControls {

	private pitchObject: THREE.Object3D;
	private yawObject: THREE.Object3D;

	private moveLeft = false;
	private moveRight = false;

	enabled: boolean = false;
	private velocity = new THREE.Vector3(1, 1, 1);

	private static PI_2 = Math.PI / 2;

	public constructor(camera: THREE.Camera) {
		camera.rotation.set(0, 0, 0);
		this.pitchObject = new THREE.Object3D();
		this.pitchObject.add(camera);

		this.yawObject = new THREE.Object3D();
		this.yawObject.position.y = 10;
		this.yawObject.add(this.pitchObject);

		this.initEventListeners();
	}

	public getObject() {
		return this.yawObject;
	}

	public setPitchRotationX(x: number): void {
		this.pitchObject.rotation.x = x;
	}

	private initEventListeners(): void {
		document.addEventListener('mousemove', (event) => this.onMouseMove(event), false);
		document.addEventListener('keydown', (event) => this.setMove(event.keyCode, true), false);
		document.addEventListener('keyup', (event) => this.setMove(event.keyCode, false), false);
	}

	private onMouseMove(event) {
		if (this.enabled === false) return;

		const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
		const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

		const factor = 0.002;
		this.yawObject.rotation.y -= movementX * factor;
		this.pitchObject.rotation.x -= movementY * factor;
		this.pitchObject.rotation.x = Math.max(-CameraMoveControls.PI_2, Math.min(CameraMoveControls.PI_2, this.pitchObject.rotation.x));
	};

	private setMove(keyCode: number, value: boolean): void {
		if (this.enabled === false) return;
		switch (keyCode) {
			case 65: // a
				this.moveLeft = value;
				break;
			case 68: // d
				this.moveRight = value;
				break;
		}
	}

	public update(delta: number): void {
		if (this.enabled === false) return;

		const factor = 10.0 * delta;
		this.velocity.x -= this.velocity.x * factor;

		const step = 400.0 * delta;
		if (this.moveLeft) this.velocity.x -= step;
		if (this.moveRight) this.velocity.x += step;

		this.yawObject.translateX(this.velocity.x * delta);
	}
}

//-------------------------------------------------------------------

function lockPointer(controls: CameraMoveControls) {
	const message = document.getElementById('message');
	const blocker = document.getElementById('blocker');
	const gameOver = document.getElementById('gameOver');
	const pointerlockerror = (event) => {
		document.addEventListener('keydown', (event) => {
			if (event.keyCode == 27) { // ESC
				controls.enabled = false;
				blocker.style.display = 'block';
				message.style.display = 'none';
				gameOver.style.display = 'none';
			}
		}, false);
		message.innerHTML = document.getElementById('errorMessage').innerHTML;
		blocker.style.display = 'none';
		gameOver.style.display = 'none';
		message.style.display = 'block';
		controls.enabled = true;
	};

	var havePointerLock = 'pointerLockElement' in document || 'mozPointerLockElement' in document || 'webkitPointerLockElement' in document;
	if (havePointerLock) {
		const _body: any = document.body;
		const _doc: any = document;
		_body.requestPointerLock = _body.requestPointerLock || _body.mozRequestPointerLock || _body.webkitRequestPointerLock;
		const pointerlockchange = (event) => {
			if (_doc.pointerLockElement === _body || _doc.mozPointerLockElement === _body || _doc.webkitPointerLockElement === _body) {
				controls.enabled = true;
				blocker.style.display = 'none';
				message.style.display = 'block';
			} else {
				controls.enabled = false;
				blocker.style.display = 'block';
				message.style.display = 'none';
			}
		};
		document.addEventListener('pointerlockchange', pointerlockchange, false);
		document.addEventListener('mozpointerlockchange', pointerlockchange, false);
		document.addEventListener('webkitpointerlockchange', pointerlockchange, false);
		document.addEventListener('pointerlockerror', pointerlockerror, false);
		document.addEventListener('mozpointerlockerror', pointerlockerror, false);
		document.addEventListener('webkitpointerlockerror', pointerlockerror, false);

		if (/Firefox/i.test(navigator.userAgent)) {
			var fullscreenchange = (event) => {
				if (_doc.fullscreenElement === _body || _doc.mozFullscreenElement === _body || _doc.mozFullScreenElement === _body) {
					_doc.removeEventListener('fullscreenchange', fullscreenchange);
					_doc.removeEventListener('mozfullscreenchange', fullscreenchange);
					_body.requestPointerLock();
					controls.enabled = true;
				} else
					controls.enabled = false;
			};
			_doc.addEventListener('fullscreenchange', fullscreenchange, false);
			_doc.addEventListener('mozfullscreenchange', fullscreenchange, false);
			_body.requestFullscreen = _body.requestFullscreen || _body.mozRequestFullscreen || _body.mozRequestFullScreen || _body.webkitRequestFullscreen;
			_body.requestFullscreen();
		} else {
			_body.requestPointerLock();
		}
	} else {
		pointerlockerror(null);
	}
}

//-------------------------------------------------------------------

class MouseShooter {
	private radius: number;
	private mass: number;
	private factory: ShapeFactory;
	private camera: THREE.PerspectiveCamera;

	private pos = new THREE.Vector3();
	private screenCenter = new THREE.Vector2(0, 0);
	private raycaster = new THREE.Raycaster();
	private quat = new THREE.Quaternion(0, 0, 0, 1);
	private ballMaterial = new THREE.MeshPhongMaterial({ color: 0x202020 });

	constructor(radius: number, mass: number, factory: ShapeFactory, camera: THREE.PerspectiveCamera) {
		this.radius = radius;
		this.mass = mass;
		this.factory = factory;
		this.camera = camera;
	}

	public shoot() {
		this.raycaster.setFromCamera(this.screenCenter, this.camera);

		this.pos.copy(this.raycaster.ray.direction);
		this.pos.add(this.raycaster.ray.origin);
		this.pos.setZ(this.pos.z - 10);

		const ball = this.factory.createSphere(this.radius, this.mass, this.pos, this.quat, this.ballMaterial);
		ball.castShadow = true;
		ball.receiveShadow = true;

		const body = ball.userData.physicsBody;
		this.pos.copy(this.raycaster.ray.direction);
		this.pos.multiplyScalar(160);
		body.setLinearVelocity(new Ammo.btVector3(this.pos.x, this.pos.y, this.pos.z));
	}
}

//-------------------------------------------------------------------

window.onload = () => {
	const elem = document.getElementById('container');
	elem.innerHTML = "";

	if (!Detector.webgl) {
		Detector.addGetWebGLMessage();
	} else {
		const engine = new Engine(elem, 0xBFD1E5);
		engine.enableShadows();

		// CAMERA
		{
			let camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.2, 1000);
			engine.setCamera(camera);
		}

		// DIRECTIONAL LIGHT
		{
			let light = new THREE.DirectionalLight(0xffffff, 1);
			light.castShadow = true;
			light.position.set(50, 100, 50);
			const d = 100;
			light.shadow.camera.left = -d;
			light.shadow.camera.right = d;
			light.shadow.camera.top = d;
			light.shadow.camera.bottom = -d;
			light.shadow.camera.near = 2;
			light.shadow.camera.far = 500;
			light.shadow.mapSize.x = 4096;
			light.shadow.mapSize.y = 4096;
			engine.addLight(light);
		}

		// AMBIENT LIGHT
		{
			let ambientLight = new THREE.AmbientLight(0x606060);
			engine.addLight(ambientLight);
		}

		const factory = new ShapeFactory(engine);

		const textureLoader = new THREE.TextureLoader();

		const groundScaleZ = 100;
		const groundRotationX = 0.15;
		// GROUND
		{
			const ground = factory.createParalellepiped(100, 1, groundScaleZ, 0, new THREE.Vector3(0, -0.5, 0), new THREE.Quaternion(groundRotationX, 0, 0, 1), new THREE.MeshPhongMaterial({ color: 0xFFFFFF }));
			const wallLeft = factory.createParalellepiped(2, 50, 90, 0, new THREE.Vector3(-51, 0, 0), new THREE.Quaternion(0, 0, 0, 1), new THREE.MeshPhongMaterial({ color: 0xFFFFFF }));
			const wallRight = factory.createParalellepiped(2, 50, 90, 0, new THREE.Vector3(51, 0, 0), new THREE.Quaternion(0, 0, 0, 1), new THREE.MeshPhongMaterial({ color: 0xFFFFFF }));
			ground.castShadow =
				ground.receiveShadow =
				wallLeft.castShadow = true;
			wallLeft.receiveShadow =
				wallRight.castShadow =
				wallRight.receiveShadow = true;
			textureLoader.load("img/cement.jpg", (texture) => {
				texture.wrapS = THREE.RepeatWrapping;
				texture.wrapT = THREE.RepeatWrapping;
				texture.repeat.set(5, 5);
				//@ts-ignore
				ground.material.map = texture;
				ground.material.needsUpdate = true;
				//@ts-ignore
				wallLeft.material.map = texture;
				wallLeft.material.needsUpdate = true;
				//@ts-ignore
				wallRight.material.map = texture;
				wallRight.material.needsUpdate = true;


			});
			engine.addObject(ground);
			engine.addObject(wallLeft);
			engine.addObject(wallRight);
		}

		let _material = new THREE.MeshPhongMaterial({ color: 0xFFFFFF });
		textureLoader.load("img/brick.jpg", (texture) => {
			texture.wrapS = THREE.RepeatWrapping;
			texture.wrapT = THREE.RepeatWrapping;
			_material.map = texture;
			_material.needsUpdate = true;
		});

		let _dropCount = 0;
		setInterval(() => {
			_dropCount++;
			if (_dropCount % 5) {
				dropBrick(_material);
			} else {
				dropSephere(_material);
			}
		}, 2000)

		function dropBrick(material) {
			if (!controls.enabled) return;
			let _x = 26 * Math.random() * (Math.random() > .5 ? -1 : 1);
			let _pos = new THREE.Vector3(_x, 15, -30);
			factory.createParalellepiped(6, 6, 6, 30, _pos, new THREE.Quaternion(0, 0, 0, 1), material);
		}
		function dropSephere(material) {
			if (!controls.enabled) return;
			let _x = 50 * Math.random() * (Math.random() > .5 ? -1 : 1);
			let _z = -50 * Math.random();
			let _pos = new THREE.Vector3(_x, 15, _z);
			factory.createSphere(10, 60, _pos, new THREE.Quaternion(0, 0, 0, 1), material);
		}

		// CONTROLS
		const controls = new CameraMoveControls(engine.getCamera());
		controls.getObject().position.set(0, -10, 90);
		controls.getObject().rotation.y = 0;
		controls.setPitchRotationX(0);
		engine.addObject(controls.getObject());

		// MOUSE SHOOTER
		const mouseShooter = new MouseShooter(1.2, 10, factory, engine.getCamera());

		// HANDLE MOUSE CLICK
		var isMouseDowning = false;
		window.addEventListener('mousedown', (event) => {
			isMouseDowning = true;
			let element = <Element>event.target;
			if (element.nodeName == 'A')
				return;
			else if (!controls.enabled) {
				lockPointer(controls);
			}
		}, false);
		window.addEventListener('mouseup', (event) => {
			isMouseDowning = false;
		}, false);

		var edgeZ = Math.cos(groundRotationX) * groundScaleZ;
		// START THE ENGINE
		var totalTime = 0;
		var duration = 0;
		var beginTime = 0;
		function animate() {
			if (beginTime == 0) {
				beginTime = new Date().getTime();
			} else {
				let _currentTime = new Date().getTime();
				totalTime += (_currentTime-beginTime);
				document.getElementById('scoreBar').innerHTML = Math.floor(totalTime / 1000) + "." + totalTime % 1000;
				beginTime = _currentTime;
			}
			requestAnimationFrame(animate);
			const deltaTime = engine.update(controls, edgeZ);
			duration += deltaTime;
			controls.update(deltaTime);
			if (isMouseDowning && duration > 0.2) {
				duration = 0;
				mouseShooter.shoot();
			}
		}
		animate();
	}
};
